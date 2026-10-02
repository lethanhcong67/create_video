import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import dotenv from "dotenv";
import crypto from "crypto";
import sharp from "sharp";
import { GoogleGenAI, Modality } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const PORT = 3000;

// Helper to normalize Kling AI base endpoint
function normalizeKlingBaseUrl(inputUrl?: string): string {
  const defaultEndpoint = "https://api.openlux.ai/kling";
  const raw = (inputUrl && inputUrl.trim()) || defaultEndpoint;
  let clean = raw.replace(/\/+$/, "");
  // If user provided a full path like https://api.openlux.ai/kling/v1/videos/image2video or https://api.klingai.com/v1/videos/image2video
  if (clean.includes("/v1/videos")) {
    clean = clean.split("/v1/videos")[0];
  }
  return clean.replace(/\/+$/, "");
}

// Generate HS256 JWT for Kling AI AccessKey & SecretKey pair
function generateKlingJwt(accessKey: string, secretKey: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey.trim(),
    exp: now + 1800,
    nbf: now - 5,
  };

  const b64Url = (obj: any) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const encodedHeader = b64Url(header);
  const encodedPayload = b64Url(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac("sha256", secretKey.trim())
    .update(signingInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${signingInput}.${signature}`;
}

// Resolves Kling authorization token from API key, keeping the user's key 100% intact as-is
function resolveKlingAuthToken(apiKeyOrAk?: string, secretKey?: string): string | null {
  // If either field is filled, extract the raw key verbatim
  let rawKey = (apiKeyOrAk && apiKeyOrAk.trim()) || (secretKey && secretKey.trim()) || process.env.KLINGAI_API_KEY || process.env.KLINGAI_SECRET_KEY || "";

  if (!rawKey) return null;

  // Strip leading "Bearer " if user accidentally pasted it with the key
  if (rawKey.toLowerCase().startsWith("bearer ")) {
    rawKey = rawKey.slice(7).trim();
  }

  // GIỮ NGUYÊN 100% KEY NGƯỜI DÙNG NHẬP VÀO - TUYỆT ĐỐI KHÔNG TỰ ĐỘNG CHUẨN HÓA HAY TẠO JWT
  return rawKey;
}

// Helper to normalize OpenAI / OpenLux / Custom API endpoint
function normalizeEditsEndpoint(inputUrl?: string): { editUrl: string; baseUrl: string } {
  const defaultEndpoint = "https://api.openlux.ai/v1/images/edits";
  const raw = (inputUrl && inputUrl.trim()) || defaultEndpoint;
  let clean = raw.replace(/\/+$/, "");

  // If user specified exact edits endpoint
  if (clean.endsWith("/images/edits")) {
    return {
      editUrl: clean,
      baseUrl: clean.replace(/\/images\/edits$/, ""),
    };
  }
  // If user passed /images
  if (clean.endsWith("/images")) {
    const base = clean.replace(/\/images$/, "");
    return {
      editUrl: `${base}/images/edits`,
      baseUrl: base,
    };
  }
  // If user passed base like https://www.mnapi.com/v1
  return {
    editUrl: `${clean}/images/edits`,
    baseUrl: clean,
  };
}

// Lazy initialization of GoogleGenAI client with optional custom API key
function getGeminiClient(customApiKey?: string): GoogleGenAI | null {
  const apiKey = (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();

  // Increase payload limit for batch high-res images
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    const hasKey = !!process.env.GEMINI_API_KEY;
    const hasOpenAiKey = !!process.env.OPENAI_API_KEY;
    const hasKlingKey = !!(
      process.env.KLINGAI_API_KEY ||
      (process.env.KLINGAI_ACCESS_KEY && process.env.KLINGAI_SECRET_KEY)
    );
    res.json({
      status: "ok",
      hasApiKey: hasKey,
      hasOpenAiKey: hasOpenAiKey,
      hasKlingKey: hasKlingKey,
      defaultModel: "gemini-3.1-flash-image",
      gptImageModel: "gpt-image-2",
    });
  });

  // Product Web Scraper Endpoint to fetch product metadata & images from URL
  app.post("/api/product/scrape", async (req, res) => {
    try {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ success: false, error: "Thiếu địa chỉ đường dẫn (URL) sản phẩm" });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url.trim());
      } catch (_) {
        return res.status(400).json({ success: false, error: "Đường dẫn URL không hợp lệ" });
      }

      console.log(`\n🔍 [Product Scraper] Đang cào thông tin sản phẩm từ: ${parsedUrl.href}`);

      let title = "";
      let description = "";
      const imageUrls: string[] = [];

      // 1. Kiểm tra nhanh nếu là Shopify store (như joymade.co, v.v...)
      if (parsedUrl.pathname.includes("/products/")) {
        const cleanProductPath = parsedUrl.pathname.replace(/\/$/, "");
        const shopifyJsonUrl = `${parsedUrl.origin}${cleanProductPath}.json`;
        try {
          const shopifyRes = await fetch(shopifyJsonUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(6000),
          });
          if (shopifyRes.ok) {
            const shopifyData: any = await shopifyRes.json();
            if (shopifyData?.product) {
              const p = shopifyData.product;
              title = p.title || "";
              description = (p.body_html || "")
                .replace(/<[^>]*>?/gm, " ")
                .replace(/\s+/g, " ")
                .trim();
              if (Array.isArray(p.images)) {
                for (const img of p.images) {
                  const src = img.src || img;
                  if (typeof src === "string") {
                    const cleanSrc = src.startsWith("//") ? `https:${src}` : src;
                    if (!imageUrls.includes(cleanSrc)) {
                      imageUrls.push(cleanSrc);
                    }
                  }
                }
              }
              console.log(
                `🛍️ [Shopify API] Cào thành công sản phẩm: "${title}" với ${imageUrls.length} ảnh gốc`
              );
            }
          }
        } catch (shopifyErr) {
          console.warn("Shopify API probe failed, falling back to HTML:", shopifyErr);
        }
      }

      // 2. Nếu chưa lấy được từ Shopify API, cào qua HTML / JSON-LD / OpenGraph
      if (!title || imageUrls.length === 0) {
        const response = await fetch(parsedUrl.href, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          return res
            .status(400)
            .json({ success: false, error: `Không thể kết nối tới website (HTTP Status ${response.status})` });
        }

        const html = await response.text();

        // Check JSON-LD schema
        const jsonLdMatches = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
        if (jsonLdMatches) {
          for (const block of jsonLdMatches) {
            try {
              const rawJson = block.replace(/<\/?script[^>]*>/gi, "").trim();
              const parsed = JSON.parse(rawJson);
              const items = Array.isArray(parsed) ? parsed : [parsed];
              for (const it of items) {
                if (it["@type"] === "Product" || it.name) {
                  if (!title && it.name) title = it.name;
                  if (!description && it.description) description = it.description;
                  if (it.image) {
                    const imgs = Array.isArray(it.image) ? it.image : [it.image];
                    for (const im of imgs) {
                      const src = typeof im === "string" ? im : im?.url;
                      if (src && !imageUrls.includes(src)) imageUrls.push(src);
                    }
                  }
                }
              }
            } catch (_) {}
          }
        }

        // Extract Title from OpenGraph or Title tag
        if (!title) {
          const ogTitleMatch =
            html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
            html.match(/<meta\s+name=["']title["']\s+content=["']([^"']+)["']/i);
          if (ogTitleMatch) {
            title = ogTitleMatch[1];
          } else {
            const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleTagMatch) title = titleTagMatch[1];
          }
        }

        title = title.replace(/\s+/g, " ").trim();

        // Extract Description from OpenGraph or Meta tag
        if (!description) {
          const ogDescMatch =
            html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
            html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
          if (ogDescMatch) {
            description = ogDescMatch[1];
          }
        }

        // Extract Images from og:image
        const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
        if (ogImageMatch) {
          try {
            const ogImg = new URL(ogImageMatch[1], parsedUrl.href).href;
            if (!imageUrls.includes(ogImg)) {
              imageUrls.unshift(ogImg);
            }
          } catch (_) {}
        }

        // Extract <img> tags
        const imageRegex = /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi;
        let match;
        while ((match = imageRegex.exec(html)) !== null) {
          const rawSrc = match[1];
          if (
            rawSrc &&
            !rawSrc.startsWith("data:") &&
            !rawSrc.includes("favicon") &&
            !rawSrc.includes(".svg") &&
            !rawSrc.includes("logo") &&
            !rawSrc.includes("icon") &&
            !rawSrc.includes("avatar")
          ) {
            try {
              const absoluteSrc = new URL(rawSrc, parsedUrl.href).href;
              if (!imageUrls.includes(absoluteSrc)) {
                imageUrls.push(absoluteSrc);
              }
            } catch (_) {}
          }
        }
      }

      console.log(`✅ [Product Scraper] Hoàn tất cào: "${title.slice(0, 50)}..." và ${imageUrls.length} hình ảnh sản phẩm`);

      const productResult = {
        url: parsedUrl.href,
        title: title || "Sản phẩm thương mại",
        description: description || "Không có mô tả chi tiết",
        images: imageUrls.slice(0, 12),
      };

      return res.json({
        success: true,
        product: productResult,
        ...productResult,
      });
    } catch (err: any) {
      console.error("❌ [Product Scraper Error]:", err);
      return res.status(500).json({ success: false, error: err?.message || "Lỗi khi cào dữ liệu sản phẩm từ URL" });
    }
  });

  // Helper to prepare compressed reference image part for Gemini multimodal analysis
  async function prepareProductImagePart(images: string[]): Promise<any> {
    if (!images || images.length === 0 || typeof images[0] !== "string") return null;
    try {
      const firstImg = images[0];
      let imgBuf: Buffer | null = null;
      if (firstImg.startsWith("data:")) {
        const match = firstImg.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          imgBuf = Buffer.from(match[2], "base64");
        }
      } else if (firstImg.startsWith("http://") || firstImg.startsWith("https://")) {
        console.log(`📥 [Image Helper] Tải ảnh sản phẩm gốc để AI phân tích: ${firstImg.slice(0, 80)}...`);
        const fRes = await fetch(firstImg, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(6000),
        });
        if (fRes.ok) {
          const ab = await fRes.arrayBuffer();
          imgBuf = Buffer.from(ab);
        }
      }
      if (imgBuf) {
        try {
          const smallJpg = await sharp(imgBuf)
            .resize(512, 512, { fit: "inside" })
            .jpeg({ quality: 80 })
            .toBuffer();
          return {
            inlineData: {
              mimeType: "image/jpeg",
              data: smallJpg.toString("base64"),
            },
          };
        } catch {
          return {
            inlineData: {
              mimeType: "image/jpeg",
              data: imgBuf.toString("base64"),
            },
          };
        }
      }
    } catch (imgErr) {
      console.warn("⚠️ Không thể tải ảnh gửi kèm prompt:", imgErr);
    }
    return null;
  }

  // Helper to execute Gemini multimodal request
  async function callGeminiVisionText(
    apiKey: string,
    promptText: string,
    imagePart: any,
    visionConfig?: any,
    targetModel = "gemini-3.7-flash"
  ): Promise<string> {
    let responseText = "";
    if (apiKey.startsWith("sk-")) {
      const openluxEndpoint =
        visionConfig?.baseUrl && visionConfig.baseUrl.trim()
          ? visionConfig.baseUrl.trim()
          : `https://api.openlux.ai/v1beta/models/${targetModel}:generateContent`;

      console.log(`📡 [Gemini Gateway] Gọi OpenLux (${targetModel}) tại: ${openluxEndpoint}...`);
      const parts: any[] = [];
      if (imagePart) parts.push(imagePart);
      parts.push({ text: promptText });

      let openluxRes = await fetch(openluxEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
          "x-goog-api-key": apiKey.trim(),
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!openluxRes.ok && openluxRes.status === 404) {
        console.warn(`⚠️ [Gemini Gateway] Endpoint ${targetModel} trả về 404, thử fallback sang gemini-2.5-flash...`);
        openluxRes = await fetch("https://api.openlux.ai/v1beta/models/gemini-2.5-flash:generateContent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey.trim()}`,
            "x-goog-api-key": apiKey.trim(),
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(90000),
        });
      }

      if (!openluxRes.ok) {
        const errText = await openluxRes.text();
        throw new Error(`OpenLux Gemini Gateway báo lỗi (${openluxRes.status}): ${errText.slice(0, 200)}`);
      }

      const openluxData: any = await openluxRes.json();
      if (openluxData?.candidates?.[0]?.content?.parts) {
        for (const part of openluxData.candidates[0].content.parts) {
          if (part.text && !part.thought) {
            responseText += part.text;
          }
        }
      }
    } else {
      console.log(`📡 [Gemini Official] Gọi Google GenAI SDK (${targetModel})...`);
      const client = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });

      const contents: any[] = [];
      if (imagePart) contents.push(imagePart);
      contents.push(promptText);

      let geminiResponse;
      try {
        geminiResponse = await client.models.generateContent({
          model: targetModel,
          contents: contents as any,
        });
      } catch (mErr: any) {
        console.warn(`⚠️ Không thể gọi ${targetModel} với Google SDK, thử fallback gemini-2.5-flash:`, mErr?.message);
        geminiResponse = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contents as any,
        });
      }

      responseText = geminiResponse.text || "";
    }
    return responseText;
  }

  // 1. DEDICATED PRE-ANALYSIS: Endpoint phân tích chi tiết đặc tính sản phẩm TRƯỚC
  app.post("/api/product/analyze-details", async (req, res) => {
    try {
      const {
        title,
        description,
        images = [],
        customKey,
        visionConfig,
        model = "gemini-3.7-flash",
      } = req.body;
      const apiKey = (customKey && customKey.trim()) || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ error: "Thiếu Gemini API Key để thực hiện phân tích sản phẩm" });
      }

      const imagePart = await prepareProductImagePart(images);

      const prompt = `
Bạn là một Chuyên Gia Giám Định Sản Phẩm Cao Cấp & Trưởng Phòng Kiểm Soát Chất Lượng POD (Print-on-Demand) / Sản phẩm in ấn theo yêu cầu & Quà tặng cá nhân hóa quốc tế.

NHIỆM VỤ TỐI QUAN TRỌNG:
Hãy phân tích cực kỳ tỉ mỉ, chính xác và chuyên sâu toàn bộ đặc tính vật lý và thẩm mỹ của sản phẩm này.
Mục tiêu là để toàn bộ các thông số này sau đó sẽ được đưa vào TỪNG CÂU LỆNH PROMPT tạo ảnh và video AI phân cảnh, giúp AI tái tạo chính xác 100% hình dáng, tỷ lệ, chất liệu và họa tiết in ấn mà KHÔNG BỊ BIẾN DẠNG HÌNH HỌC.

THÔNG TIN SẢN PHẨM:
- Tên sản phẩm: ${title || "Chưa có tiêu đề"}
- Mô tả: ${description || "Chưa có mô tả"}
- Ảnh sản phẩm tham chiếu: ${imagePart ? "[Đã đính kèm ảnh chụp thực tế để kiểm tra trực quan]" : "Dựa trên mô tả và tên"}

YÊU CẦU PHÂN TÍCH TỪNG TRƯỜNG THÔNG TIN:
1. "productName": Tên và loại sản phẩm chuẩn xác (ví dụ: "Đĩa thủy tinh tròn vát cạnh treo cây thông Noel (Round Glass Ornament)", "Cốc gốm sứ trắng 11oz", "Bình giữ nhiệt Tumbler inox 304 20oz", "Tranh mica đèn LED", v.v.).
2. "category": Thể loại sản phẩm (ví dụ: "Đồ trang trí Giáng Sinh / Noel", "Cốc / Ly sứ", "Bình giữ nhiệt", "Áo thun thời trang", "Trang sức / Phụ kiện", "Quà tặng in ấn", v.v.).
3. "material": Chất liệu thực tế và đặc tính bề mặt quang học (ví dụ: "Thủy tinh trong suốt cao cấp vát cạnh beveled tinh xảo, có độ khúc xạ ánh sáng lấp lánh tự nhiên", hoặc "Gốm sứ tráng men bóng cao cấp", hoặc "Inox 304 sơn tĩnh điện chải xước").
4. "shape": Hình dạng hình học chính xác.
   => CẢNH BÁO CHỐNG BIẾN DẠNG RẤT QUAN TRỌNG: Nêu rõ cấu trúc hình học (ví dụ: "Miếng đĩa tròn dẹt phẳng 2D vát cạnh, có khoen xỏ dây phía trên - TUYỆT ĐỐI KHÔNG PHẢI quả cầu 3D / sphere / ball", hoặc "Khối trụ tròn thẳng đứng có nắp đậy và quai xách", hoặc "Tấm phẳng chữ nhật").
5. "dimensions": Kích thước và tỷ lệ vật lý thật trong đời sống (ví dụ: "Đường kính tiêu chuẩn ~3.5 inch (khoảng 8.9cm), độ dày tấm kính ~3.5mm, khi cầm trên tay tỷ lệ vừa vặn trong lòng bàn tay người lớn").
6. "designDetails": Chi tiết họa tiết thiết kế in ấn & Typography (Mô tả chi tiết hình vẽ minh họa, từng câu chữ/typography in trên sản phẩm, màu sắc chủ đạo, độ sắc nét tack-sharp, vị trí in chính diện hay quanh thân).
7. "finish": Độ bóng, độ trong suốt và phụ kiện đi kèm (ví dụ: "Bề mặt kính bóng bẩy phản chiếu ánh đèn lấp lánh, đi kèm dây treo ruy bằng kim tuyến vàng ánh kim sang trọng").
8. "keyFeatures": 2-3 điểm nhấn đắt giá nhất của sản phẩm giúp làm nổi bật vẻ đẹp thương mại.
9. "promptSnippet": Một đoạn mô tả chuẩn xác bằng TIẾNG ANH (khoảng 2-3 câu) ghi rõ Tên sản phẩm, Chất liệu thật, Cấu trúc hình học chuẩn xác (chống nhầm 2D/3D), Kích thước thật và Yêu cầu bảo toàn 100% họa tiết in ấn để nhúng vào Prompt.

Hãy trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng định dạng sau (không bọc trong bất kỳ văn bản nào khác ngoài JSON):
{
  "productSpecs": {
    "productName": "...",
    "category": "...",
    "material": "...",
    "shape": "...",
    "dimensions": "...",
    "designDetails": "...",
    "finish": "...",
    "keyFeatures": "...",
    "promptSnippet": "..."
  },
  "productSummary": "Tóm tắt ngắn gọn điểm nổi bật nhất của sản phẩm"
}
`;

      const responseText = await callGeminiVisionText(apiKey, prompt, imagePart, visionConfig, model);
      let jsonString = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();

      let parsedData;
      try {
        parsedData = JSON.parse(jsonString);
      } catch {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Không thể phân tích phản hồi JSON từ Gemini");
        }
      }

      return res.json({
        success: true,
        productSpecs: parsedData.productSpecs,
        productSummary: parsedData.productSummary || "",
      });
    } catch (err: any) {
      console.error("❌ [Analyze Product Details Error]:", err);
      return res.status(500).json({ error: err?.message || "Lỗi khi phân tích chi tiết sản phẩm" });
    }
  });

  // 2. STORYBOARD GENERATOR: Lên kịch bản phân cảnh và NHÚNG TRỰC TIẾP THÔNG TIN CHI TIẾT SẢN PHẨM VÀO TỪNG PROMPT
  app.post("/api/product/analyze-and-script", async (req, res) => {
    try {
      const {
        title,
        description,
        images = [],
        productSpecs, // Pre-analyzed and reviewed/edited product specifications
        customKey,
        visionConfig,
        model = "gemini-3.7-flash",
        targetDuration = "30s"
      } = req.body;
      const apiKey = (customKey && customKey.trim()) || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ error: "Thiếu Gemini API Key để thực hiện phân tích kịch bản" });
      }

      const imagePart = await prepareProductImagePart(images);

      // Extract optional user scene style preference
      const { sceneStylePreference = "balanced" } = req.body;

      const podAdaptiveSceneKnowledge = `
HỆ THỐNG ĐẠO DIỄN AI - TỰ ĐỘNG ĐỀ XUẤT 5 PHÂN CẢNH TÙY BIẾN ĐỘC QUYỀN CHO TỪNG LOẠI SẢN PHẨM:

BẠN LÀ MỘT ĐẠO DIỄN QUẢNG CÁO QUỐC TẾ. NHIỆM VỤ CỦA BẠN LÀ TỰ ĐỘNG PHÂN TÍCH THỂ LOẠI SẢN PHẨM VÀ ĐỀ XUẤT 4 ĐẾN 5 PHÂN CẢNH PHÙ HỢP NHẤT VỚI CÔNG NĂNG VÀ BỐI CẢNH THỰC TẾ CỦA SẢN PHẨM ĐÓ:

HƯỚNG DẪN ĐỀ XUẤT THEO TỪNG DANH MỤC SẢN PHẨM (Ví dụ tham khảo để AI tự do sáng tạo linh hoạt):
1. Đồ Uống / Cốc Ly / Bình Giữ Nhiệt (Mug, Tumbler, Water Bottle):
   - Cảnh 1: Cầm tay nhấp ngụm cà phê sáng bên khung cửa sổ ngập tràn ánh nắng.
   - Cảnh 2: Mở hộp quà trang trọng trên bàn gỗ hoặc đặt vào khay đựng cốc trên ô tô / bàn làm việc.
   - Cảnh 3: Cận cảnh Macro vát cạnh, giọt nước đọng hoặc vệt phản chiếu ánh sáng trên lớp men gốm/inox.
   - Cảnh 4: Rót nước hoặc đặt bên laptop bàn làm việc hiện đại.
   - Cảnh 5: Nụ cười sảng khoái của nhân vật cầm cốc chào ngày mới.

2. Đồ Trang Trí / Ornament Giáng Sinh / Keepsake (Acrylic / Glass / Ceramic Ornament):
   - Cảnh 1: Cận cảnh cầm tay trực diện UGC khoe trọn họa tiết in ấn và độ trong suốt của thủy tinh/mica.
   - Cảnh 2: Mở nắp hộp quà thắt nơ đỏ nhấc ornament từ khay lót nhung.
   - Cảnh 3: Siêu cận Macro góc nghiêng 30 độ bắt vệt sáng lấp lánh trên mép vát kim cương (beveled edge).
   - Cảnh 4: Treo vững chắc trên cành thông Noel xanh mướt lung linh ánh đèn vàng ấm áp.
   - Cảnh 5: Nụ cười hạnh phúc của nhân vật bên cây thông Noel ngắm nhìn sản phẩm.

3. Thời Trang & May Mặc (T-shirt, Hoodie, Nón, Giày):
   - Cảnh 1: Người mẫu mặc áo dạo phố phong cách streetwear tự tin, máy quay tracking chuyển động.
   - Cảnh 2: Gấp phẳng flatlay trên nền gỗ mở hộp unboxing hoặc vuốt phẳng ngực áo.
   - Cảnh 3: Cực cận Macro sợi dệt cotton và độ sắc nét của hình in trên vải.
   - Cảnh 4: Phối đồ (lookbook) trước gương hoặc dạo bước trong quán cà phê thời thượng.
   - Cảnh 5: Người mẫu tạo dáng nở nụ cười tự tin, truyền cảm hứng sở hữu.

4. Quà Tặng Đèn LED / Tranh Mica / Tranh Canvas / Trang Trí Nhà Cửa:
   - Cảnh 1: Đặt trên bàn đầu giường hoặc kệ sách, bật công tắc đèn LED tỏa ánh sáng ấm cúng.
   - Cảnh 2: Mở hộp quà lót xốp bảo vệ sang trọng.
   - Cảnh 3: Cận cảnh độ trong trẻo của mica, bề mặt vân vải canvas và chi tiết in siêu nét.
   - Cảnh 4: Toàn cảnh căn phòng ngủ/phòng khách ấm cúng với sản phẩm làm điểm nhấn thẩm mỹ.
   - Cảnh 5: Cặp đôi hoặc nhân vật xúc động ngắm nhìn thông điệp in trên sản phẩm.

5. Trang Sức / Phụ Kiện Cá Nhân / Móc Khóa / Ví Da:
   - Cảnh 1: Đeo trên cổ/cổ tay hoặc cầm trên tay kết hợp trang phục tinh tế.
   - Cảnh 2: Mở hộp nhung trang sức sang trọng hé lộ sản phẩm lấp lánh.
   - Cảnh 3: Macro phản chiếu ánh sáng kim loại, đá quý hoặc đường may viền da tinh xảo.
   - Cảnh 4: Đặt vào túi xách hoặc tương tác trong sinh hoạt hàng ngày.
   - Cảnh 5: Biểu cảm ngạc nhiên, xúc động khi nhận được món quà cá nhân hóa.

QUY TẮC BẮT BUỘC ĐẢM BẢO TÍNH ĐA DẠNG & THỰC TẾ (STRICT RULES):
1. TỰ ĐỘNG THÍCH ỨNG: AI tự động phân tích và tạo các phân cảnh phù hợp 100% với công năng của sản phẩm. Không áp đặt cảnh treo cây thông cho cốc, không áp đặt cảnh mặc áo cho tranh mica.
2. KHÔNG TRÙNG LẶP: Mỗi phân cảnh trong kịch bản PHẢI CÓ GÓC MÁY (Camera Angle), BỐI CẢNH (Setting/Environment), THAO TÁC (Action) và BỐ CỤC KHÁC NHAU 100%.
3. TONE ẢNH CHÂN THẬT NHƯ CHỤP IPHONE (AUTHENTIC IPHONE PHOTOGRAPHY - ZERO PLASTIC / ZERO AI LOOK):
   - Phong cách chụp: Ảnh chụp tự nhiên từ camera điện thoại iPhone (Shot on iPhone snapshot, 24mm/48mm lens, raw unedited photo).
   - Tông màu & Ánh sáng: Ánh sáng ban ngày tự nhiên (ambient daylight), độ tương phản mềm mại tự nhiên, màu sắc trung thực không bị rực rỡ quá mức (accurate true-to-life colors).
   - Tuyệt đối KHÔNG nhựa (NO plastic sheen), KHÔNG sáp bóng AI (NO waxy skin), KHÔNG đồ họa 3D render, KHÔNG hiệu ứng ảo nhân tạo.
   - Da người thật: Rõ vân da, lỗ chân lông tự nhiên (microscopic pores), tông da ấm áp chân thực đời thường.
4. VIDEO MỖI CẢNH LÀ ONESHOT KHÔNG CHUYỂN CẢNH (SINGLE CONTINUOUS ONE-SHOT TAKE):
   - Mỗi phân cảnh 5s là MỘT ĐOẠN QUAY LIÊN TỤC DUY NHẤT (Single continuous uncut camera recording).
   - Tuyệt đối KHÔNG cắt cảnh, KHÔNG nhảy cảnh, KHÔNG đổi góc máy đột ngột bên trong một phân cảnh 5s.
5. SẢN PHẨM KHÔNG TỰ Ý CHUYỂN ĐỘNG (STRICT INANIMATE PHYSICS & ZERO PHANTOM MOVEMENT):
   - Sản phẩm là vật vô tri vô giác: TUYỆT ĐỐI KHÔNG TỰ XOAY, KHÔNG TỰ LƠ LỬNG BAY TRONG KHÔNG TRUNG, KHÔNG TỰ NHẤC LÊN ĐẶT XUỐNG nếu không có bàn tay người tác động.
   - Khi sản phẩm đặt trên bàn, trên kệ, trong hộp quà hoặc treo trên cây: Sản phẩm PHẢI ĐỨNG YÊN HOÀN TOÀN 100% TẠI VỊ TRÍ CỐ ĐỊNH (completely stationary static object anchored firmly). Chuyển động duy nhất trong cảnh là góc máy quay di chuyển nhẹ nhàng.
   - Khi có người mẫu/bàn tay thao tác: Sản phẩm CHỈ di chuyển theo lực cầm và hướng di chuyển của bàn tay người thật.
6. CHUYỂN ĐỘNG ĐỜI THƯỜNG & KHÔNG SLOW-MOTION (STANDARD 1.0X REAL-TIME SPEED):
   - Chuyển động camera có độ thở (organic camera breathing) và độ rung lắc tự nhiên nhẹ nhàng như người cầm điện thoại quay video đời thực.
   - Tốc độ chuẩn 1.0x thời gian thực, tuyệt đối KHÔNG slow-motion, không giật lag.
7. BẢO TOÀN THIẾT KẾ GỐC 100%: Mọi hình in, chữ viết, logo, họa tiết và màu sắc từ ảnh tham chiếu phải được giữ nguyên vẹn, sắc nét tack-sharp, không bị biến dạng, không bị méo mó khi chuyển động.
8. VẬT LÝ VỮNG CHẮC: Luôn có điểm tựa vững chắc (cầm trên tay, đặt trên bàn, đeo trên người, treo trên giá). TUYỆT ĐỐI KHÔNG LƠ LỬNG TRONG KHÔNG KHÍ.
9. THỜI LƯỢNG: Mỗi cảnh đúng 5 giây, toàn bộ kịch bản gồm 4 đến 5 phân cảnh.
`;

      let prompt = "";
      if (productSpecs && productSpecs.productName) {
        prompt = `
Bạn là một Đạo Diễn Video Quảng Cáo POD (Print-on-Demand) / Quà tặng cá nhân hóa đẳng cấp quốc tế.

${podAdaptiveSceneKnowledge}

THÔNG SỐ VẬT LÝ VÀ ĐẶC TÍNH SẢN PHẨM ĐÃ ĐƯỢC GIÁM ĐỊNH CHI TIẾT:
- Tên & Loại sản phẩm: ${productSpecs.productName}
- Thể loại: ${productSpecs.category || "Sản phẩm POD / Quà tặng"}
- Chất liệu thực tế: ${productSpecs.material}
- Hình dạng hình học chính xác: ${productSpecs.shape}
- Kích thước & Tỷ lệ thật trong đời sống: ${productSpecs.dimensions}
- Họa tiết in ấn & Typography/Chữ viết: ${productSpecs.designDetails}
- Phụ kiện & Bề mặt hoàn thiện: ${productSpecs.finish}
- Điểm nhấn nổi bật: ${productSpecs.keyFeatures || ""}
- Đoạn mô tả tiếng Anh chuẩn hóa: ${productSpecs.promptSnippet || ""}

YÊU CẦU DỰNG KỊCH BẢN:
Hãy tự động phân tích sản phẩm "${productSpecs.productName}" và đề xuất 4-5 phân cảnh hoàn toàn phù hợp với loại sản phẩm này (Vertical 9:16, mỗi cảnh đúng 5s, không lời thoại, quay oneshot).

YÊU CẦU CHO TỪNG CÂU LỆNH "imagePrompt" (BẰNG TIẾNG ANH - TONE ẢNH CHỤP IPHONE ĐỜI THƯỜNG, KHÔNG NHỰA, KHÔNG AI SÁP BÓNG):
- Format: "Vertical 9:16 authentic iPhone snapshot photograph of [${productSpecs.productName}], [Góc máy & Bối cảnh đời thường đặc thù cho sản phẩm này], [Thao tác cầm nắm thực tế của bàn tay người hoặc đặt vững chãi trên mặt bàn/kệ, zero floating], shot on iPhone 15 Pro camera, 24mm lens, raw unedited mobile photo, natural diffused daylight, genuine human skin texture with visible microscopic pores and realistic skin tone, absolutely no plastic sheen, no waxy AI skin, no 3D CGI render, crafted from [${productSpecs.material}], precise shape [${productSpecs.shape}], realistic scale [${productSpecs.dimensions}], 100% identical printed artwork and crisp legible typography from reference image, authentic ambient soft shadows, photorealistic 8k."

YÊU CẦU CHO TỪNG CÂU LỆNH "videoPrompt" (BẰNG TIẾNG ANH - SINGLE ONESHOT TAKE, ĐIỆN THOẠI QUAY, SẢN PHẨM ĐỨNG YÊN NẾU KHÔNG CÓ TAY NGƯỜI, KHÔNG SLOW MOTION):
- Format: "Vertical 9:16 single continuous one-shot UGC video of [${productSpecs.productName}], [Chuyển động camera điện thoại và thao tác tay người nếu có], single continuous take without cuts, continuous camera recording from start to finish, zero scene switching, shot on mobile phone camera, standard 1.0x real-time speed, authentic real-life movement, product remains completely stationary anchored on surface unless held or moved by real human hands, strictly no self-rotation, no autonomous movement, no floating, strictly no slow motion, printed artwork and typography remain 100% stable, sharp and distortion-free, natural physics and gravity, 4k ultra realistic."

Hãy trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc sau:
{
  "productSpecs": {
    "productName": "${productSpecs.productName}",
    "category": "${productSpecs.category || ""}",
    "material": "${productSpecs.material}",
    "shape": "${productSpecs.shape}",
    "dimensions": "${productSpecs.dimensions}",
    "designDetails": "${productSpecs.designDetails}",
    "finish": "${productSpecs.finish}",
    "keyFeatures": "${productSpecs.keyFeatures || ""}",
    "promptSnippet": "${productSpecs.promptSnippet || ""}"
  },
  "productSummary": "Tóm tắt điểm đặc sắc nhất của sản phẩm",
  "adConcept": "Ý tưởng kịch bản thị giác tùy biến linh hoạt cho sản phẩm này",
  "scriptTitle": "Tiêu đề video quảng cáo",
  "scenes": [
    {
      "sceneNumber": 1,
      "sceneType": "Tên thể loại cảnh tự đề xuất (ví dụ: Cảnh Cầm tay UGC / Cảnh Mở hộp quà / Cảnh Bàn làm việc / Cảnh Dạo phố / ...)",
      "title": "Cảnh 1: Tiêu đề mô tả cảnh phù hợp với sản phẩm",
      "visualDescription": "Mô tả khung hình thị giác dọc 9:16 chân thực...",
      "productFocus": "Đặc tả chi tiết sản phẩm trong cảnh này...",
      "imagePrompt": "Vertical 9:16 authentic iPhone snapshot photograph of ... shot on iPhone 15 Pro, raw unedited photo, natural skin pores, no plastic sheen, no waxy AI skin, crisp legible typography from reference image, photorealistic 8k",
      "videoPrompt": "Vertical 9:16 single continuous one-shot UGC video of [${productSpecs.productName}], ... single continuous take without cuts, standard 1.0x real-time speed, stationary static product unless held by hand, strictly no self-rotation, no floating, strictly no slow motion, natural physics, 4k",
      "cameraMotion": "handheld",
      "duration": "5"
    }
  ]
}
`;
      } else {
        prompt = `
Bạn là một Chuyên Gia Giám Định Sản Phẩm & Đạo Diễn Video Quảng Cáo POD (Print-on-Demand) / Quà tặng quốc tế.

${podAdaptiveSceneKnowledge}

THÔNG TIN SẢN PHẨM TỪ WEBSITE:
- Tên sản phẩm: ${title || "Sản phẩm"}
- Mô tả sản phẩm: ${description || "Không có mô tả"}
- Ảnh sản phẩm tham chiếu: ${imagePart ? "[Đã đính kèm ảnh chụp thực tế để kiểm tra trực quan]" : "Dựa trên mô tả và tên"}

YÊU CẦU:
1. Phân tích chi tiết đặc tính vật lý (Tên, Chất liệu, Hình dáng chuẩn xác, Kích thước thật, Họa tiết in ấn, Phụ kiện).
2. Tự động đề xuất 4-5 phân cảnh hoàn toàn phù hợp và linh hoạt riêng cho thể loại sản phẩm này (Vertical 9:16, mỗi cảnh đúng 5s, quay oneshot).
3. ĐƯA TOÀN BỘ ĐẶC TÍNH VẬT LÝ VÀO TỪNG imagePrompt và videoPrompt, TUÂN THỦ: Tone ảnh iPhone chân thực, Không nhựa, Không sáp bóng AI, Single oneshot video không cắt cảnh, Không lơ lửng, Không tự xoay, Tốc độ tự nhiên 1.0x đời thực, Không slow motion, Họa tiết in 100% sắc nét rõ ràng.

Hãy trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc:
{
  "productSpecs": {
    "productName": "Tên và loại sản phẩm chuẩn xác",
    "category": "Thể loại sản phẩm",
    "material": "Chất liệu cụ thể và đặc tính bề mặt",
    "shape": "Hình dạng hình học chính xác (chống biến dạng 2D/3D)",
    "dimensions": "Kích thước & tỷ lệ vật lý thật trong đời sống",
    "designDetails": "Chi tiết họa tiết in ấn, hình ảnh, typography và màu sắc",
    "finish": "Độ bóng, độ trong suốt, phụ kiện đi kèm",
    "keyFeatures": "Điểm nhấn nổi bật",
    "promptSnippet": "English physical specs snippet"
  },
  "productSummary": "Tóm tắt điểm đặc sắc nhất của sản phẩm",
  "adConcept": "Ý tưởng kịch bản thị giác tùy biến riêng cho sản phẩm này",
  "scriptTitle": "Tiêu đề video quảng cáo",
  "scenes": [
    {
      "sceneNumber": 1,
      "sceneType": "Tên thể loại cảnh tự đề xuất",
      "title": "Cảnh 1: Tiêu đề cảnh",
      "visualDescription": "Mô tả khung hình thị giác dọc 9:16 chân thực...",
      "productFocus": "Góc máy đặc tả sản phẩm...",
      "imagePrompt": "Vertical 9:16 authentic iPhone snapshot photograph of ... shot on iPhone 15 Pro, raw unedited photo, natural skin pores, no plastic sheen, crisp typography, photorealistic 8k",
      "videoPrompt": "Vertical 9:16 single continuous one-shot UGC video of ..., single continuous take without cuts, standard 1.0x real-time speed, stationary static product unless held by hand, strictly no self-rotation, no floating, strictly no slow motion, 4k",
      "cameraMotion": "handheld",
      "duration": "5"
    }
  ]
}
`;
      }

      const responseText = await callGeminiVisionText(apiKey, prompt, imagePart, visionConfig, model);
      let jsonString = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();

      let parsedScript;
      try {
        parsedScript = JSON.parse(jsonString);
      } catch (parseErr) {
        console.warn("⚠️ [Analyze Script] Parse JSON thất bại, thử tìm khung JSON:", responseText.slice(0, 200));
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedScript = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Không thể phân tích phản hồi kịch bản dạng JSON từ Gemini");
        }
      }

      return res.json({
        success: true,
        script: parsedScript,
      });
    } catch (err: any) {
      console.error("❌ [Analyze & Script Error]:", err);
      return res.status(500).json({ error: err?.message || "Lỗi khi phân tích sản phẩm và tạo kịch bản video" });
    }
  });

  // In-memory cache for generated scene images to keep client state lightweight and persist throughout the session
  const sceneImagesCache = new Map<string, { buffer: Buffer; mimeType: string; base64: string; createdAt: number }>();

  // Periodically clean up items older than 4 hours
  setInterval(() => {
    const cutoff = Date.now() - 4 * 60 * 60 * 1000;
    for (const [id, item] of sceneImagesCache.entries()) {
      if (item.createdAt < cutoff) {
        sceneImagesCache.delete(id);
      }
    }
  }, 15 * 60 * 1000);

  // Endpoint to serve generated scene images with strong caching
  app.get("/api/scene/image/:id", (req, res) => {
    const rawId = req.params.id.replace(/\.[a-zA-Z0-9]+$/, "");
    const item = sceneImagesCache.get(rawId) || sceneImagesCache.get(req.params.id);
    if (!item) {
      return res.status(404).send("Ảnh phân cảnh không tồn tại hoặc đã hết hạn trong phiên làm việc.");
    }
    res.setHeader("Content-Type", item.mimeType || "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.send(item.buffer);
  });

  // Dedicated Scene Image Generator from Product Reference Image
  app.post("/api/scene/generate-image", async (req, res) => {
    try {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const {
        referenceImageUrl,
        referenceImageBase64,
        prompt,
        aspectRatio = "9:16",
        apiKey,
        provider,
        gptImageConfig,
      } = req.body;

      const rawRef = referenceImageBase64 || referenceImageUrl;
      if (!rawRef) {
        return res.status(400).json({ error: "Thiếu hình ảnh sản phẩm tham chiếu (reference image is required)" });
      }

      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Thiếu mô tả hình ảnh phân cảnh (prompt is required)" });
      }

      // Convert reference to base64 buffer
      let base64Data = "";
      let mimeType = "image/jpeg";
      if (typeof rawRef === "string" && (rawRef.startsWith("http://") || rawRef.startsWith("https://"))) {
        console.log(`📥 [Scene Image Gen] Đang tải ảnh tham chiếu từ URL: ${rawRef.slice(0, 100)}...`);
        const fetchRes = await fetch(rawRef, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          },
        });
        if (!fetchRes.ok) {
          throw new Error(`Không thể tải ảnh sản phẩm từ URL (${fetchRes.status})`);
        }
        const arrayBuf = await fetchRes.arrayBuffer();
        base64Data = Buffer.from(arrayBuf).toString("base64");
        const ct = fetchRes.headers.get("content-type");
        if (ct) mimeType = ct.split(";")[0];
      } else if (typeof rawRef === "string" && rawRef.startsWith("data:")) {
        const match = rawRef.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        } else {
          base64Data = rawRef.split(",")[1] || rawRef;
        }
      } else {
        base64Data = rawRef;
      }

      const effectiveGeminiKey = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY || "";
      const effectiveGptKey = (gptImageConfig?.apiKey && gptImageConfig.apiKey.trim()) || process.env.OPENAI_API_KEY || "";
      
      const isGeminiNative = effectiveGeminiKey.startsWith("AIzaSy");
      const useOpenLux = !isGeminiNative && (effectiveGeminiKey.startsWith("sk-") || effectiveGptKey.startsWith("sk-") || provider === "gpt-image-2");

      console.log(`🎨 [Scene Image Gen] Khởi tạo ảnh phân cảnh bằng: ${useOpenLux ? "OpenLux AI / GPT-Image-2" : "Google Gemini"}`);
      console.log(`Prompt: "${prompt.slice(0, 150)}..."`);
      console.log(`Tỉ lệ: ${aspectRatio}`);

      let generatedDataUrl = "";

      if (useOpenLux) {
        const keyToUse = effectiveGeminiKey.startsWith("sk-") ? effectiveGeminiKey : (effectiveGptKey || "sk-***REVOKED-ROTATE-ME***");
        const rawBuf = Buffer.from(base64Data, "base64");
        
        let pngBuf: Buffer;
        try {
          pngBuf = await sharp(rawBuf)
            .resize(1024, 1024, { fit: "inside" })
            .ensureAlpha()
            .png()
            .toBuffer();
        } catch {
          pngBuf = rawBuf;
        }

        const strictFidelityDirective = `[CRITICAL PRODUCT REPRODUCTION & IPHONE SNAPSHOT REALISM DIRECTIVE]:
You MUST reproduce the product EXACTLY as shown in the provided reference image with authentic iPhone camera snapshot realism.
1. IPHONE REALISM & NATURAL TONES: Shot on iPhone 15 Pro mobile camera (24mm/48mm lens), candid smartphone photography style, raw unedited mobile photo, natural diffused daylight, true-to-life organic colors and accurate white balance. ABSOLUTELY NO plastic sheen, NO waxy AI skin, NO 3D CGI render, NO oversaturated digital artwork.
2. HUMAN ANATOMY & SKIN: Human hands and skin must be completely photorealistic with visible natural microscopic skin pores, subtle skin texture, natural authentic skin tone, and anatomically correct 5 fingers (ABSOLUTELY NO deformed fingers or plastic smoothing).
3. PRINTED ARTWORK & TYPOGRAPHY: Every single graphic element, printed illustration, typography, letters, font style, and colors must match the reference product 100%. The printed design must be in tack-sharp focus, pristine, 100% legible, and distortion-free.
4. GEOMETRY & MATERIALS: Maintain the identical physical shape, profile, and proportions of the product from the reference image (disc stays flat disc, mug stays cylinder, etc.). Authentic real-world physical material behavior (ceramic glaze, glass transparency, metal sheen, fabric weave).
5. GROUNDED REALISM: The product must be firmly and naturally held in hand with real grip gravity or resting securely on a table/box surface with realistic contact shadows (ZERO floating in mid-air).

Specific scene layout and action: ${prompt}`;

        const formData = new FormData();
        formData.append("image", new Blob([new Uint8Array(pngBuf)], { type: "image/png" }), "reference_product.png");
        formData.append("prompt", strictFidelityDirective);
        formData.append("model", gptImageConfig?.model || "gpt-image-2");
        formData.append("size", "1152x2048");
        formData.append("response_format", "b64_json");

        const targetEditUrl = gptImageConfig?.baseUrl ? normalizeEditsEndpoint(gptImageConfig.baseUrl).editUrl : "https://api.openlux.ai/v1/images/edits";
        
        let editRes = await fetch(targetEditUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keyToUse}`,
          },
          body: formData,
        });

        if (!editRes.ok) {
          // Retry with 1024x1024 if size error
          formData.set("size", "1024x1024");
          editRes = await fetch(targetEditUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${keyToUse}` },
            body: formData,
          });
        }

        if (!editRes.ok) {
          const errText = await editRes.text();
          throw new Error(`OpenLux/GPT-Image-2 báo lỗi (${editRes.status}): ${errText.slice(0, 200)}`);
        }

        const resData: any = await editRes.json();
        const b64 = resData?.data?.[0]?.b64_json;
        if (b64) {
          generatedDataUrl = `data:image/png;base64,${b64}`;
        } else if (resData?.data?.[0]?.url) {
          generatedDataUrl = resData.data[0].url;
        } else {
          throw new Error("Không nhận được dữ liệu ảnh từ OpenLux/GPT-Image-2");
        }
      } else {
        // Native Google Gemini Client
        const client = new GoogleGenAI({
          apiKey: effectiveGeminiKey,
          httpOptions: { headers: { "User-Agent": "aistudio-build" } },
        });

        const targetModel = "gemini-3.1-flash-image";
        const strictFidelityDirective = `[CRITICAL PRODUCT REPRODUCTION & IPHONE SNAPSHOT REALISM DIRECTIVE]:
You MUST reproduce the product EXACTLY as shown in the provided reference image with authentic iPhone camera snapshot realism.
1. IPHONE REALISM & NATURAL TONES: Shot on iPhone 15 Pro mobile camera (24mm/48mm lens), candid smartphone photography style, raw unedited mobile photo, natural diffused daylight, true-to-life organic colors and accurate white balance. ABSOLUTELY NO plastic sheen, NO waxy AI skin, NO 3D CGI render, NO oversaturated digital artwork.
2. HUMAN ANATOMY & SKIN: Human hands and skin must be completely photorealistic with visible natural microscopic skin pores, subtle skin texture, natural authentic skin tone, and anatomically correct 5 fingers (ABSOLUTELY NO deformed fingers or plastic smoothing).
3. PRINTED ARTWORK & TYPOGRAPHY: Every single graphic element, printed illustration, typography, letters, font style, and colors must match the reference product 100%. The printed design must be in tack-sharp focus, pristine, 100% legible, and distortion-free.
4. GEOMETRY & MATERIALS: Maintain the identical physical shape, profile, and proportions of the product from the reference image (disc stays flat disc, mug stays cylinder, etc.). Authentic real-world physical material behavior (ceramic glaze, glass transparency, metal sheen, fabric weave).
5. GROUNDED REALISM: The product must be firmly and naturally held in hand with real grip gravity or resting securely on a table/box surface with realistic contact shadows (ZERO floating in mid-air).

Specific scene layout and action: ${prompt}`;

        const response = await client.models.generateContent({
          model: targetModel,
          contents: {
            parts: [
              { text: "[PRIMARY PRODUCT REFERENCE - MUST PRESERVE IDENTICAL GEOMETRY, ARTWORK, TEXT, AND MATERIALS]:\nBelow is the authentic reference product. The final commercial photograph must feature this exact item with 100% fidelity to its shape, custom printed graphic design, typography, and material texture." },
              { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Data } },
              { text: strictFidelityDirective },
            ] as any,
          },
          config: {
            responseModalities: [Modality.IMAGE],
            imageConfig: {
              aspectRatio: "9:16" as any,
              imageSize: "1K",
            },
          },
        });

        let foundB64 = "";
        let foundMime = "image/png";
        if (response?.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              foundB64 = part.inlineData.data;
              foundMime = part.inlineData.mimeType || "image/png";
              break;
            }
          }
        }

        if (!foundB64) {
          throw new Error("Gemini không trả về dữ liệu hình ảnh cho phân cảnh này.");
        }
        generatedDataUrl = `data:${foundMime};base64,${foundB64}`;
      }

      let clientImageUrl = generatedDataUrl;
      if (generatedDataUrl.startsWith("data:")) {
        const commaIdx = generatedDataUrl.indexOf(",");
        const metaPart = generatedDataUrl.slice(0, commaIdx);
        const rawB64 = generatedDataUrl.slice(commaIdx + 1);
        const mimeMatch = metaPart.match(/data:([^;]+)/);
        const imgMime = (mimeMatch && mimeMatch[1]) || "image/png";
        const imgBuffer = Buffer.from(rawB64, "base64");

        const imageId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        sceneImagesCache.set(imageId, {
          buffer: imgBuffer,
          mimeType: imgMime,
          base64: rawB64,
          createdAt: Date.now(),
        });
        clientImageUrl = `/api/scene/image/${imageId}.png`;
      }

      console.log(`✅ [Scene Image Gen] Tạo ảnh phân cảnh thành công! (${clientImageUrl})`);
      return res.json({
        success: true,
        imageUrl: clientImageUrl,
      });
    } catch (err: any) {
      console.error("❌ [Scene Image Gen Error]:", err);
      return res.status(500).json({ error: err?.message || "Lỗi khi tạo ảnh phân cảnh từ ảnh tham chiếu sản phẩm" });
    }
  });

  // Validate API key endpoint for Gemini
  app.post("/api/validate-key", async (req, res) => {
    try {
      const { apiKey, model = "gemini-3.1-flash-image", baseUrl } = req.body;
      const keyToTest = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY;

      if (!keyToTest) {
        return res.status(400).json({
          valid: false,
          error: "Không tìm thấy khóa API nào để kiểm tra. Vui lòng nhập khóa API của bạn.",
        });
      }

      // If key starts with sk- or baseUrl specifies custom endpoint like openlux.ai
      const effectiveBaseUrl =
        (baseUrl && baseUrl.trim()) ||
        (keyToTest.startsWith("sk-")
          ? "https://api.openlux.ai/v1beta/models/gemini-3.7-flash:generateContent"
          : "");

      if (
        effectiveBaseUrl &&
        (effectiveBaseUrl.includes("openlux.ai") || keyToTest.startsWith("sk-"))
      ) {
        const endpoint = resolveVisionEndpoint(effectiveBaseUrl, "gemini", model);
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyToTest.trim()}`,
          "x-goog-api-key": keyToTest.trim(),
        };
        const testRes = await fetch(endpoint.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Ping" }] }],
          }),
        });
        if (testRes.ok) {
          return res.json({
            valid: true,
            message: `Khóa API hợp lệ! Kết nối thành công tới ${endpoint.url}.`,
            modelTested: endpoint.model,
            isCustomKey: Boolean(apiKey && apiKey.trim()),
          });
        }
        const errText = await testRes.text();
        return res.status(400).json({
          valid: false,
          error: `Lỗi kết nối máy chủ (${testRes.status}): ${errText.slice(0, 150)}`,
        });
      }

      const client = new GoogleGenAI({
        apiKey: keyToTest.trim(),
        httpOptions: {
          headers: { "User-Agent": "aistudio-build" },
        },
      });

      // Quick test using a lightweight query
      const testResponse = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Ping",
      });

      if (testResponse) {
        return res.json({
          valid: true,
          message: "Khóa API hợp lệ! Kết nối Google Gemini thành công.",
          modelTested: model,
          isCustomKey: Boolean(apiKey && apiKey.trim()),
        });
      }

      return res.json({
        valid: false,
        error: "Không nhận được phản hồi từ dịch vụ Gemini.",
      });
    } catch (err: any) {
      console.warn("Lỗi kiểm tra API key Gemini:", err?.message || err);
      let errorMsg = err?.message || "Khóa API không hợp lệ hoặc đã hết hạn ngạch.";
      if (errorMsg.includes("API_KEY_INVALID") || errorMsg.includes("invalid API key")) {
        errorMsg = "Khóa API không chính xác. Vui lòng kiểm tra lại chuỗi khóa được cấp từ Google AI Studio.";
      } else if (errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota")) {
        errorMsg = "Khóa API đã hết hạn ngạch (quota exceeded). Vui lòng đổi khóa khác hoặc kiểm tra tài khoản.";
      }
      return res.status(400).json({
        valid: false,
        error: errorMsg,
      });
    }
  });

  // Validate API key endpoint for GPT-Image-2 (OpenAI / OpenLux AI / OpenAI-compatible)
  app.post("/api/validate-gpt-image-key", async (req, res) => {
    try {
      const { apiKey, baseUrl = "https://api.openlux.ai/v1/images/edits", model = "gpt-image-2" } = req.body;
      const keyToTest = (apiKey && apiKey.trim()) || process.env.OPENAI_API_KEY;

      if (!keyToTest) {
        return res.status(400).json({
          valid: false,
          error: "Chưa nhập khóa API của GPT-Image-2 / OpenLux AI. Vui lòng nhập API Key (thường bắt đầu bằng sk-...).",
        });
      }

      const { baseUrl: cleanBaseUrl, editUrl } = normalizeEditsEndpoint(baseUrl);
      const targetUrl = `${cleanBaseUrl}/models`;

      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${keyToTest.trim()}`,
        },
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return res.json({
          valid: true,
          message: `Khóa API hợp lệ! Kết nối thành công tới ${editUrl} với mô hình ${model}.`,
          modelTested: model,
          endpoint: editUrl,
          isCustomKey: Boolean(apiKey && apiKey.trim()),
        });
      }

      const errData = await response.json().catch(() => ({}));
      let errMsg = errData?.error?.message || `Lỗi kết nối máy chủ (Mã phản hồi: ${response.status})`;
      if (response.status === 401) {
        errMsg = `Khóa API không chính xác hoặc token không hợp lệ đối với ${editUrl}. Vui lòng kiểm tra lại key.`;
      } else if (response.status === 429) {
        errMsg = "Khóa API đã hết hạn ngạch (Quota exceeded) hoặc vượt quá tần suất yêu cầu.";
      }

      return res.status(400).json({
        valid: false,
        error: errMsg,
      });
    } catch (err: any) {
      console.warn("Lỗi kiểm tra API key:", err?.message || err);
      return res.status(400).json({
        valid: false,
        error: err?.message || "Không thể kết nối đến máy chủ API. Vui lòng kiểm tra lại Base URL hoặc kết nối mạng.",
      });
    }
  });

  const DEFAULT_VISION_KEY = process.env.VISION_API_KEY || process.env.GEMINI_API_KEY || "sk-***REVOKED-ROTATE-ME***";
  const DEFAULT_VISION_URL = process.env.VISION_API_URL || "https://api.openlux.ai/v1beta/models/gemini-3.7-flash:generateContent";
  const DEFAULT_VISION_MODEL = "gemini-3.5-flash";

  // Helper to resolve Vision API Endpoint for all formats (Gemini REST / OpenAI / OpenLux)
  function resolveVisionEndpoint(rawBaseUrl?: string, provider = "gemini", model = DEFAULT_VISION_MODEL) {
    const clean = (rawBaseUrl || (provider === "gemini" ? DEFAULT_VISION_URL : "")).trim().replace(/\/+$/, "");

    // If user passed a full Gemini generateContent endpoint (e.g., https://api.openlux.ai/v1beta/models/gemini-3.7-flash:generateContent)
    if (clean.includes(":generateContent")) {
      const extractedModel = clean.split("/models/")[1]?.split(":")[0] || model || DEFAULT_VISION_MODEL;
      return { type: "gemini-rest" as const, url: clean, model: extractedModel };
    }

    // If user passed a URL containing /models/ without :generateContent
    if (clean.includes("/models/")) {
      const extractedModel = clean.split("/models/")[1]?.split("/")[0] || model || DEFAULT_VISION_MODEL;
      return { type: "gemini-rest" as const, url: `${clean}:generateContent`, model: extractedModel };
    }

    // If user passed an OpenAI chat completion endpoint
    if (clean.includes("/chat/completions")) {
      return { type: "openai-rest" as const, url: clean, model: model || "gpt-4o-mini" };
    }

    // If provider is explicitly openai / openlux or URL ends with /v1
    if (provider === "openai" || provider === "openlux" || (clean.endsWith("/v1") && !clean.includes("v1beta"))) {
      const base = clean || "https://api.openlux.ai/v1";
      return { type: "openai-rest" as const, url: `${base}/chat/completions`, model: model || "gpt-4o-mini" };
    }

    // Default Gemini REST endpoint
    const geminiBase = clean ? clean.replace(/\/v1beta$/, "") : "https://api.openlux.ai";
    const effectiveModel = model || DEFAULT_VISION_MODEL;
    return {
      type: "gemini-rest" as const,
      url: `${geminiBase}/v1beta/models/${effectiveModel}:generateContent`,
      model: effectiveModel,
    };
  }

  // Execute Vision Analysis with multi-format REST support
  async function executeVisionAnalysis(params: {
    base64Data: string;
    mimeType: string;
    prompt: string;
    apiKey?: string;
    baseUrl?: string;
    provider?: string;
    model?: string;
  }) {
    const { base64Data, mimeType, prompt, apiKey, baseUrl, provider, model } = params;
    const endpoint = resolveVisionEndpoint(baseUrl, provider, model);

    if (endpoint.type === "gemini-rest") {
      let targetUrl = endpoint.url;
      if (apiKey && !targetUrl.includes("key=") && targetUrl.includes("googleapis.com")) {
        targetUrl += (targetUrl.includes("?") ? "&" : "?") + `key=${encodeURIComponent(apiKey)}`;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "aistudio-build",
      };
      if (apiKey) {
        headers["x-goog-api-key"] = apiKey;
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || "image/jpeg",
                  data: base64Data,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      };

      const res = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      const resText = await res.text();
      let resJson: any = null;
      try {
        resJson = resText ? JSON.parse(resText) : null;
      } catch (_) { }

      if (!res.ok) {
        const errMsg =
          resJson?.error?.message ||
          resJson?.message ||
          `Lỗi HTTP ${res.status} từ máy chủ Vision AI (${resText.slice(0, 180)})`;
        throw new Error(errMsg);
      }

      const textOutput = resJson?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text || "")
        .join("")
        .trim();

      if (!textOutput) {
        throw new Error("Dịch vụ Vision AI không trả về nội dung phân tích.");
      }

      return {
        text: textOutput,
        engine: `Gemini REST (${endpoint.model})`,
      };
    } else {
      // OpenAI REST
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const requestBody = {
        model: endpoint.model || "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType || "image/jpeg"};base64,${base64Data}` },
              },
            ],
          },
        ],
        max_tokens: 1200,
        temperature: 0.2,
      };

      const res = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      const resText = await res.text();
      let resJson: any = null;
      try {
        resJson = resText ? JSON.parse(resText) : null;
      } catch (_) { }

      if (!res.ok) {
        const errMsg =
          resJson?.error?.message ||
          resJson?.message ||
          `Lỗi HTTP ${res.status} từ OpenAI/OpenLux Vision (${resText.slice(0, 180)})`;
        throw new Error(errMsg);
      }

      const textOutput = resJson?.choices?.[0]?.message?.content?.trim();
      if (!textOutput) {
        throw new Error("Dịch vụ OpenAI/OpenLux Vision không trả về nội dung.");
      }

      return {
        text: textOutput,
        engine: `OpenAI REST (${endpoint.model})`,
      };
    }
  }

  // Validate API key endpoint for Vision Analysis (Gemini / OpenAI Vision)
  app.post("/api/validate-vision-key", async (req, res) => {
    try {
      const { apiKey, provider = "gemini", model = DEFAULT_VISION_MODEL, baseUrl } = req.body;
      const keyToTest = (apiKey && apiKey.trim()) || (provider === "gemini" ? DEFAULT_VISION_KEY : process.env.OPENAI_API_KEY);

      if (!keyToTest) {
        return res.status(400).json({
          valid: false,
          error: "Chưa nhập khóa API cho Vision AI. Vui lòng nhập API Key để kiểm tra.",
        });
      }

      const endpoint = resolveVisionEndpoint(baseUrl, provider, model);

      if (endpoint.type === "gemini-rest") {
        let targetUrl = endpoint.url;
        if (keyToTest && !targetUrl.includes("key=") && targetUrl.includes("googleapis.com")) {
          targetUrl += (targetUrl.includes("?") ? "&" : "?") + `key=${encodeURIComponent(keyToTest)}`;
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "aistudio-build",
        };
        headers["x-goog-api-key"] = keyToTest;
        headers["Authorization"] = `Bearer ${keyToTest}`;

        const pingBody = {
          contents: [
            {
              role: "user",
              parts: [{ text: "Ping. Respond with OK." }],
            },
          ],
        };

        const response = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(pingBody),
        });

        const resText = await response.text();
        let resJson: any = null;
        try {
          resJson = resText ? JSON.parse(resText) : null;
        } catch (_) { }

        if (response.ok) {
          return res.json({
            valid: true,
            message: `Khóa API Vision hợp lệ! Kết nối thành công tới ${targetUrl}.`,
            modelTested: endpoint.model,
            provider: "gemini",
            endpoint: targetUrl,
            isCustomKey: Boolean(apiKey && apiKey.trim()),
          });
        }

        const errMsg = resJson?.error?.message || resJson?.message || `HTTP ${response.status}: ${resText.slice(0, 150)}`;
        return res.status(400).json({
          valid: false,
          error: `Không thể xác thực khóa Vision API (${errMsg}).`,
        });
      } else {
        // OpenAI / OpenLux vision test
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyToTest}`,
        };

        const pingBody = {
          model: endpoint.model || "gpt-4o-mini",
          messages: [{ role: "user", content: "Ping. Respond with OK." }],
          max_tokens: 10,
        };

        const response = await fetch(endpoint.url, {
          method: "POST",
          headers,
          body: JSON.stringify(pingBody),
        });

        const resText = await response.text();
        let resJson: any = null;
        try {
          resJson = resText ? JSON.parse(resText) : null;
        } catch (_) { }

        if (response.ok) {
          return res.json({
            valid: true,
            message: `Khóa API Vision hợp lệ! Kết nối thành công tới ${endpoint.url}.`,
            modelTested: endpoint.model,
            provider: "openai",
            endpoint: endpoint.url,
            isCustomKey: Boolean(apiKey && apiKey.trim()),
          });
        }

        const errMsg = resJson?.error?.message || resJson?.message || `HTTP ${response.status}: ${resText.slice(0, 150)}`;
        return res.status(400).json({
          valid: false,
          error: `Không thể xác thực khóa Vision API (${errMsg}).`,
        });
      }
    } catch (err: any) {
      console.warn("Lỗi kiểm tra API key Vision:", err?.message || err);
      return res.status(400).json({
        valid: false,
        error: err?.message || "Khóa API không hợp lệ hoặc không thể kết nối đến URL API.",
      });
    }
  });

  // Dedicated Product Vision Analysis Endpoint
  app.post("/api/analyze-product", async (req, res) => {
    try {
      const {
        image,
        dataUrl,
        mimeType = "image/jpeg",
        fileName = "",
        apiKey,
        provider,
        model,
        baseUrl,
      } = req.body;

      const rawImage = image || dataUrl;
      if (!rawImage) {
        return res.status(400).json({
          success: false,
          error: "Thiếu dữ liệu hình ảnh sản phẩm để phân tích (image data is required).",
        });
      }

      // Extract base64 and clean mimeType
      let base64Data = rawImage;
      let cleanMimeType = mimeType;
      if (typeof rawImage === "string" && rawImage.startsWith("data:")) {
        const match = rawImage.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          cleanMimeType = match[1] || mimeType;
          base64Data = match[2];
        } else {
          const commaIdx = rawImage.indexOf(",");
          if (commaIdx !== -1) {
            base64Data = rawImage.slice(commaIdx + 1);
          }
        }
      }

      console.log(`\n🔍 [AI VISION INSPECTOR] Đang phân tích chi tiết sản phẩm: "${fileName || "product"}" (${cleanMimeType}) [URL: ${baseUrl || "Default"}]...`);

      const visionPrompt = `You are a world-class AI Vision & Commercial Product Inspector specialized in high-precision product inpainting, microscopic textile analysis, and zero-loss detail preservation.
Analyze the provided product image in extreme detail and return a single valid JSON object strictly matching this schema:
{
  "productName": "Concise, specific Vietnamese name of the product (e.g., 'Tạp dề hoa văn Mexico thêu thủ công', 'Váy dạ hội lụa satin đỏ cổ chữ V', 'Đồng hồ nam dây da nâu chronograph', 'Áo sơ mi oxford trắng', 'Vòng tay đính đá ngọc bích')",
  "category": "Vietnamese category name (e.g., 'Tạp dề', 'Áo', 'Váy / Đầm', 'Quần', 'Trang sức & Phụ kiện', 'Đồng hồ', 'Túi xách', 'Giày dép', 'Đồ trang trí')",
  "colors": "Detailed color palette in Vietnamese describing base color and all secondary/accent colors (e.g., 'Nền vải be kem mộc mạc, hoa văn phối màu đỏ ruby, vàng mù tạt, xanh ngọc bích và xanh lá')",
  "patterns": "Exhaustive description of artwork, illustrations, embroidery, graphic prints, logos, geometric motifs in Vietnamese with focus on micro-patterns, fine borders, and symmetrical details",
  "textOrTypography": "All visible text, brand names, phrases, typography, or embroidery letters exactly as written on the product with exact uppercase/lowercase spelling (or 'Không có chữ viết' if none)",
  "materials": "Fabric texture, finish, and material in Vietnamese (e.g., 'Vải canvas cotton dày dặn, da bò sáp, kim loại mạ vàng bóng, hạt đá cẩm thạch')",
  "keyFeatures": "Specific structural and micro-structural elements in Vietnamese (e.g., 'Quai đeo cổ có nấc cài đồng, dây buộc eo bản vừa, 1 túi lớn may phía trước bụng, đường chỉ may đôi, viền bo chỉ nổi')",
  "suggestedPrompt": "A comprehensive, surgical inpainting prompt in Vietnamese instructing the AI to replace the old product in ref1 with this exact product ref2, preserving 1:1 micro-details, hard edge borders, exact text spelling, and realistic material textures (e.g., 'Thay thế chính xác 100% sản phẩm theo ảnh tham chiếu ref2 với từng chi tiết vi mô, hoa văn thêu thủ công sắc nét, chữ in chính xác, viền chỉ may nổi trên ảnh gốc ref1, giữ nguyên phông nền và người mẫu')",
  "englishPrompt": "Professional master-level inpainting prompt in English detailing the replacement of the item with this exact product, enforcing 1:1 micro-detail retention, vector-grade typography, hard edge contours, authentic textile weave, and zero blur artifacts"
}

IMPORTANT RULES:
1. Provide accurate, vivid, and micro-detailed descriptions based strictly on the image.
2. If there are words, names, or typography on the product, capture the exact spelling and font style in 'textOrTypography' and enforce them in 'suggestedPrompt'.
3. Detail all small intricate patterns, border seams, and micro-embroidery so the inpainting model preserves them without blurring.
4. Output ONLY the raw JSON object, without markdown wraps, backticks or commentary.`;

      let parsedAnalysis: any = null;
      let usedEngine = "";

      const customKey = apiKey && apiKey.trim();
      const effectiveKey = customKey || DEFAULT_VISION_KEY || process.env.OPENAI_API_KEY;

      // 1. Execute Vision analysis using specified endpoint
      try {
        const result = await executeVisionAnalysis({
          base64Data,
          mimeType: cleanMimeType,
          prompt: visionPrompt,
          apiKey: effectiveKey,
          baseUrl: baseUrl || (provider === "gemini" ? DEFAULT_VISION_URL : undefined),
          provider: provider || "gemini",
          model: model || DEFAULT_VISION_MODEL,
        });

        if (result?.text) {
          const rawOutput = result.text.trim();
          const cleanJson = rawOutput
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/i, "")
            .trim();

          try {
            parsedAnalysis = JSON.parse(cleanJson);
          } catch (jsonErr) {
            const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsedAnalysis = JSON.parse(jsonMatch[0]);
            }
          }
          usedEngine = result.engine;
        }
      } catch (visionErr: any) {
        console.warn("⚠️ Lỗi phân tích từ endpoint chính:", visionErr?.message || visionErr);

        // Backup to default Vision endpoint if available
        if (!parsedAnalysis && DEFAULT_VISION_KEY && effectiveKey !== DEFAULT_VISION_KEY) {
          try {
            const backupRes = await executeVisionAnalysis({
              base64Data,
              mimeType: cleanMimeType,
              prompt: visionPrompt,
              apiKey: DEFAULT_VISION_KEY,
              baseUrl: DEFAULT_VISION_URL,
              provider: "gemini",
              model: DEFAULT_VISION_MODEL,
            });
            if (backupRes?.text) {
              const cleanJson = backupRes.text
                .replace(/^```json\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/```$/i, "")
                .trim();
              parsedAnalysis = JSON.parse(cleanJson);
              usedEngine = `Backup Vision (${DEFAULT_VISION_MODEL})`;
            }
          } catch (backupErr: any) {
            console.warn("⚠️ Lỗi backup Vision:", backupErr?.message || backupErr);
          }
        }
      }

      // 2. Heuristic rule-based fallback if all AI services were unreachable
      if (!parsedAnalysis) {
        const fname = (fileName || "").toLowerCase();
        let fallbackName = "Sản phẩm tham chiếu";
        let fallbackCat = "Trang phục / Phụ kiện";
        if (fname.includes("apron") || fname.includes("tap") || fname.includes("bep")) {
          fallbackName = "Tạp dề phong cách thủ công";
          fallbackCat = "Tạp dề";
        } else if (fname.includes("shirt") || fname.includes("ao")) {
          fallbackName = "Áo thời trang";
          fallbackCat = "Áo";
        } else if (fname.includes("dress") || fname.includes("dam") || fname.includes("vay")) {
          fallbackName = "Váy đầm thời trang";
          fallbackCat = "Váy / Đầm";
        } else if (fname.includes("watch") || fname.includes("dongho")) {
          fallbackName = "Đồng hồ cao cấp";
          fallbackCat = "Đồng hồ";
        } else if (fname.includes("bracelet") || fname.includes("vong") || fname.includes("lac")) {
          fallbackName = "Vòng tay phụ kiện";
          fallbackCat = "Trang sức";
        }

        parsedAnalysis = {
          productName: fallbackName,
          category: fallbackCat,
          colors: "Màu sắc chi tiết theo ảnh tham chiếu ref2",
          patterns: "Họa tiết và chi tiết trang trí nguyên bản từ ảnh tham chiếu ref2",
          textOrTypography: "Không có chữ viết",
          materials: "Chất liệu cao cấp tự nhiên",
          keyFeatures: "Đường nét và cấu trúc hoàn chỉnh như ảnh mẫu ref2",
          suggestedPrompt: `Thay thế chính xác ${fallbackName} theo ảnh tham chiếu ref2 vào hình gốc ref1, giữ nguyên phông nền và người mẫu`,
          englishPrompt: `Surgically replace the item in ref1 with the exact product in ref2 (${fallbackName}), preserving scene composition and model pose.`,
        };
        usedEngine = "Heuristic rule-based fallback";
      }

      parsedAnalysis.analyzedAt = Date.now();

      console.log(`✅ [AI VISION INSPECTOR THÀNH CÔNG (${usedEngine})]:`, parsedAnalysis.productName);

      return res.json({
        success: true,
        engine: usedEngine,
        analysis: parsedAnalysis,
      });
    } catch (err: any) {
      console.error("Lỗi nghiêm trọng trong /api/analyze-product:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Đã xảy ra lỗi khi phân tích hình ảnh sản phẩm.",
      });
    }
  });

  // Validate API key endpoint for Kling AI Video
  app.post("/api/validate-kling-key", async (req, res) => {
    try {
      const { apiKey, accessKey, secretKey, baseUrl = "https://api.openlux.ai/kling" } = req.body;
      const cleanBaseUrl = normalizeKlingBaseUrl(baseUrl);
      const token = resolveKlingAuthToken(apiKey || accessKey, secretKey);

      if (!token) {
        return res.status(400).json({
          valid: false,
          error: "Chưa nhập khóa API Kling AI. Vui lòng nhập API Key (hoặc cặp Access Key & Secret Key).",
        });
      }

      // Test authorization by querying Kling task list or pinging
      const targetUrl = `${cleanBaseUrl}/v1/videos/image2video?page=1&page_size=1`;
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok || data.code === 0) {
        return res.json({
          valid: true,
          message: `Khóa API Kling AI hợp lệ! Kết nối thành công tới ${cleanBaseUrl}.`,
          endpoint: cleanBaseUrl,
          isCustomKey: Boolean(apiKey || (accessKey && secretKey)),
        });
      }

      if (response.status === 401 || response.status === 403 || data.code === 1001 || data.code === 1002) {
        return res.status(400).json({
          valid: false,
          error: data.message || `Khóa API Kling AI không chính xác hoặc token không hợp lệ (Mã HTTP: ${response.status}).`,
        });
      }

      // If status is 404/405, server reached without auth rejection
      if (response.status === 404 || response.status === 405) {
        return res.json({
          valid: true,
          message: `Kết nối thành công tới máy chủ Kling AI (${cleanBaseUrl}). Token xác thực được chấp nhận.`,
          endpoint: cleanBaseUrl,
          isCustomKey: Boolean(apiKey || (accessKey && secretKey)),
        });
      }

      return res.status(400).json({
        valid: false,
        error: data.message || `Máy chủ Kling AI trả về phản hồi mã: ${response.status}.`,
      });
    } catch (err: any) {
      console.warn("Lỗi kiểm tra API key Kling:", err?.message || err);
      return res.status(400).json({
        valid: false,
        error: err?.message || "Không thể kết nối đến máy chủ Kling AI. Vui lòng kiểm tra lại URL hoặc kết nối mạng.",
      });
    }
  });

  // Initiate Video Generation with Kling AI
  app.post("/api/kling/create-video", async (req, res) => {
    try {
      const {
        image, // Base64 data URL or URL
        imageUrl,
        image_tail, // Optional End Frame / Last Frame for Kling AI video
        endImage,
        endImageUrl,
        prompt,
        apiKey,
        accessKey,
        secretKey,
        baseUrl = "https://api.openlux.ai/kling",
        model,
        model_name,
        mode = "pro",
        duration = "5",
        aspect_ratio = "9:16",
        multi_shot = false,
        cfg_scale = 0.6,
        negative_prompt,
        watermark_info,
      } = req.body;

      const finalImage = image || imageUrl;
      if (!finalImage) {
        return res.status(400).json({
          error: "Thiếu hình ảnh đầu vào để tạo video (image is required)",
        });
      }

      const finalImageTail =
        image_tail ||
        endImage ||
        endImageUrl ||
        req.body.imageTail ||
        req.body.end_image ||
        req.body.image_tail_url ||
        null;

      const cleanBaseUrl = normalizeKlingBaseUrl(baseUrl);
      const token = resolveKlingAuthToken(apiKey || accessKey, secretKey);

      if (!token) {
        return res.status(400).json({
          error: "Chưa cấu hình API Key cho Kling AI. Vui lòng cấu hình API Key trong mục Cài đặt API.",
        });
      }

      // Format image: Kling AI accepts public URL or clean base64 string
      let formattedImage = typeof finalImage === "string" ? finalImage.trim() : finalImage;
      if (typeof formattedImage === "string" && formattedImage.includes("/api/scene/image/")) {
        const match = formattedImage.match(/\/api\/scene\/image\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const rawId = match[1].replace(/\.[a-zA-Z0-9]+$/, "");
          const cached = sceneImagesCache.get(rawId) || sceneImagesCache.get(match[1]);
          if (cached) {
            formattedImage = cached.base64;
          }
        }
      }
      if (typeof formattedImage === "string" && formattedImage.startsWith("data:")) {
        const commaIdx = formattedImage.indexOf(",");
        if (commaIdx !== -1) {
          formattedImage = formattedImage.slice(commaIdx + 1).trim();
        }
      }

      let formattedImageTail: string | null = null;
      if (finalImageTail && typeof finalImageTail === "string" && finalImageTail.trim()) {
        let cleanTail = finalImageTail.trim();
        if (cleanTail !== "undefined" && cleanTail !== "null") {
          if (cleanTail.includes("/api/scene/image/")) {
            const match = cleanTail.match(/\/api\/scene\/image\/([a-zA-Z0-9_-]+)/);
            if (match) {
              const rawId = match[1].replace(/\.[a-zA-Z0-9]+$/, "");
              const cached = sceneImagesCache.get(rawId) || sceneImagesCache.get(match[1]);
              if (cached) {
                cleanTail = cached.base64;
              }
            }
          }
          if (cleanTail.startsWith("data:")) {
            const commaIdx = cleanTail.indexOf(",");
            if (commaIdx !== -1) {
              formattedImageTail = cleanTail.slice(commaIdx + 1).trim();
            } else {
              formattedImageTail = cleanTail;
            }
          } else {
            formattedImageTail = cleanTail;
          }
        }
      }

      const baseAntiArtifactNegative =
        "self-rotating object, autonomous object spinning, floating in air, levitation, phantom movement, object moving without human hands, spontaneous lifting, deformed fingers, extra fingers, mutated hands, robotic unnatural movement, morphing, warping, artificial slow motion, blurry details, distorted logo, distorted text, low quality";

      const finalNegativePrompt =
        negative_prompt && typeof negative_prompt === "string" && !negative_prompt.includes("camera movement") && negative_prompt.trim().length > 0
          ? `${negative_prompt.trim()}, ${baseAntiArtifactNegative}`
          : baseAntiArtifactNegative;

      const defaultPrompt =
        "Vertical 9:16 authentic smartphone UGC commercial video. The model interacts naturally with standard 1.0x real-time speed, keeping the product design, prints, and structure completely fixed and unchanged. Shot on mobile phone camera, natural physics and gravity, 4k photorealistic.";

      // Build payload matching exact Kling AI image2video specification
      // NOTE: Kling AI API requires mode: "pro" when image_tail (end frame) is used.
      const payload: Record<string, any> = {
        model_name: model_name || model || "kling-v2-6",
        mode: formattedImageTail ? "pro" : (mode === "std" ? "std" : "pro"),
        duration: String(duration || "5"),
        aspect_ratio: aspect_ratio || "9:16",
        multi_shot: Boolean(multi_shot),
        image: formattedImage,
        prompt: (prompt && prompt.trim()) || defaultPrompt,
        negative_prompt: finalNegativePrompt,
        cfg_scale: typeof cfg_scale === "number" ? cfg_scale : Number(cfg_scale) || 0.6,
        watermark_info:
          watermark_info && typeof watermark_info === "object"
            ? watermark_info
            : { enabled: false },
      };

      if (formattedImageTail) {
        payload.image_tail = formattedImageTail;
      }

      console.log(
        "[Kling AI Video Request] Model:",
        payload.model_name,
        "Mode:",
        payload.mode,
        "Duration:",
        payload.duration,
        "Aspect:",
        payload.aspect_ratio,
        "CFG:",
        payload.cfg_scale,
        "Has End Frame (image_tail):",
        Boolean(payload.image_tail),
        "End Frame Info:",
        payload.image_tail
          ? payload.image_tail.startsWith("http")
            ? payload.image_tail
            : `${payload.image_tail.slice(0, 30)}... (${payload.image_tail.length} chars)`
          : "none"
      );

      const targetUrl = `${cleanBaseUrl}/v1/videos/image2video`;
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      const requestPreview = {
        ...payload,
        image:
          typeof payload.image === "string" && payload.image.length > 60
            ? `${payload.image.slice(0, 40)}... (${payload.image.length} bytes)`
            : payload.image,
        image_tail:
          payload.image_tail && typeof payload.image_tail === "string" && payload.image_tail.length > 60
            ? `${payload.image_tail.slice(0, 40)}... (${payload.image_tail.length} bytes)`
            : payload.image_tail,
      };

      if (!response.ok || (data.code !== undefined && data.code !== 0)) {
        let errMsg = data.message || data.error?.message || data.error || `Lỗi máy chủ Kling AI (HTTP ${response.status})`;
        if (response.status === 401 || data.code === 1001) {
          errMsg = "Khóa API Kling AI không chính xác hoặc token đã hết hạn.";
        } else if (response.status === 429 || data.code === 1004) {
          errMsg = "Đã vượt quá hạn ngạch hoặc tần suất yêu cầu của Kling AI.";
        }
        return res.status(response.status || 400).json({
          error: errMsg,
          details: data,
          requestPayloadPreview: requestPreview,
          loggedBody: requestPreview,
        });
      }

      const taskId = data.data?.task_id || data.task_id || data.data?.id || data.id;
      if (!taskId) {
        return res.status(500).json({
          error: "Kling AI không trả về task_id.",
          details: data,
          requestPayloadPreview: requestPreview,
          loggedBody: requestPreview,
        });
      }

      const rawStatus = data.data?.task_status || data.task_status || data.status || "submitted";
      return res.json({
        success: true,
        taskId,
        status: rawStatus,
        message: data.message || "Tác vụ tạo video đã được gửi tới Kling AI thành công.",
        requestPayloadPreview: requestPreview,
        loggedBody: requestPreview,
      });
    } catch (err: any) {
      console.error("Lỗi gửi tác vụ tạo video Kling:", err);
      return res.status(500).json({
        error: err?.message || "Lỗi nội bộ khi tạo video qua Kling AI.",
      });
    }
  });

  // Check Video Generation Status with Kling AI
  app.get("/api/kling/task-status/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;
      const {
        apiKey,
        accessKey,
        secretKey,
        baseUrl = "https://api.openlux.ai/kling",
      } = req.query as Record<string, string>;

      if (!taskId) {
        return res.status(400).json({ error: "Thiếu taskId" });
      }

      const cleanBaseUrl = normalizeKlingBaseUrl(baseUrl);
      const token = resolveKlingAuthToken(apiKey || accessKey, secretKey);

      if (!token) {
        return res.status(400).json({
          error: "Thiếu khóa xác thực Kling AI.",
        });
      }

      const targetUrl = `${cleanBaseUrl}/v1/videos/image2video/${taskId}`;
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || (data.code !== undefined && data.code !== 0)) {
        return res.status(response.status || 400).json({
          error: data.message || `Lỗi truy vấn trạng thái tác vụ Kling (HTTP ${response.status})`,
          details: data,
        });
      }

      const taskData = data.data || data || {};
      let status = taskData.task_status || taskData.status || "processing";
      if (status === "success" || status === "completed" || status === "done") {
        status = "succeed";
      }
      const statusMsg = taskData.task_status_msg || taskData.message || "";
      const videos =
        taskData.task_result?.videos ||
        taskData.videos ||
        (taskData.video_url ? [{ url: taskData.video_url, duration: taskData.duration }] : []);
      const videoUrl = videos.length > 0 ? videos[0].url : (taskData.video_url || undefined);
      const videoDuration = videos.length > 0 ? videos[0].duration : (taskData.duration || undefined);

      return res.json({
        success: true,
        taskId,
        status,
        statusMsg,
        videoUrl,
        duration: videoDuration,
        raw: taskData,
      });
    } catch (err: any) {
      console.error("Lỗi truy vấn trạng thái Kling:", err);
      return res.status(500).json({
        error: err?.message || "Lỗi khi kiểm tra tiến trình video Kling.",
      });
    }
  });

  // In-memory / file cache for merged videos
  const mergedVideosCache = new Map<string, { filePath: string; createdAt: number; mimeType: string; duration?: number }>();

  // Periodically clean up merged video files older than 12 hours
  setInterval(() => {
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    for (const [id, item] of mergedVideosCache.entries()) {
      if (item.createdAt < cutoff) {
        try {
          if (fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath);
        } catch (_) {}
        mergedVideosCache.delete(id);
      }
    }
  }, 30 * 60 * 1000);

  // Helper to query video clip duration using ffprobe
  async function getClipDurationSeconds(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      const proc = spawn(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          filePath,
        ],
        { windowsHide: true }
      );
      let stdout = "";
      proc.stdout?.on("data", (d) => {
        stdout += d.toString();
      });
      proc.on("close", (code) => {
        const dur = parseFloat(stdout.trim());
        if (code === 0 && !isNaN(dur) && dur > 0) {
          resolve(dur);
        } else {
          resolve(5.0); // Default Kling video duration
        }
      });
      proc.on("error", () => resolve(5.0));
    });
  }

  // AI-Driven Transition Analyzer: Decides optimal cinematic transition (cut, crossfade, slide, wipe, zoom) for each cut
  async function analyzeTransitionsWithAI(params: {
    scenesCount: number;
    scenes?: Array<{ prompt?: string; purpose?: string; cameraMotion?: string }>;
    transitionMode?: "auto" | "cut" | "crossfade" | "fadeblack" | "none";
    apiKey?: string;
    visionConfig?: any;
    model?: string;
  }): Promise<Array<{ fromIndex: number; toIndex: number; transition: string; duration: number; reason: string }>> {
    const { scenesCount, scenes = [], transitionMode = "auto", apiKey, visionConfig, model } = params;
    const count = scenesCount - 1;
    if (count <= 0) return [];

    // Mode 1: Explicit Hard Cut (Cắt thẳng dứt khoát 100% không giật hình)
    if (transitionMode === "cut" || transitionMode === "none") {
      return Array.from({ length: count }, (_, idx) => ({
        fromIndex: idx,
        toIndex: idx + 1,
        transition: "none",
        duration: 0,
        reason: "Cắt trực diện không hiệu ứng (Hard Cut) để giữ nhịp dứt khoát, mượt mà và không giật hình.",
      }));
    }

    // Mode 2: Explicit Crossfade (Hòa tan mềm mại 0.35s)
    if (transitionMode === "crossfade") {
      return Array.from({ length: count }, (_, idx) => ({
        fromIndex: idx,
        toIndex: idx + 1,
        transition: "fade",
        duration: 0.35,
        reason: "Hòa tan mềm mại (Cross Dissolve) êm mắt, chuyển cảnh nhẹ nhàng.",
      }));
    }

    // Mode 3: Explicit Dip to Black (Nháy tối điện ảnh 0.35s)
    if (transitionMode === "fadeblack") {
      return Array.from({ length: count }, (_, idx) => ({
        fromIndex: idx,
        toIndex: idx + 1,
        transition: "fadeblack",
        duration: 0.35,
        reason: "Chuyển tiếp nháy tối điện ảnh (Dip to Black) thanh lịch.",
      }));
    }

    // Mode 4: AI Intelligent Auto Transition Analysis (TUYỆT ĐỐI KHÔNG DÙNG PAN/SLIDE/WIPE TRÁNH GIẬT KHUNG HÌNH)
    try {
      const scenesContext = scenes
        .map(
          (sc, idx) =>
            `Phân cảnh ${idx + 1}: ${sc.purpose || "Quảng cáo sản phẩm"} - Mô tả: "${sc.prompt || ""}" - Chuyển động: ${sc.cameraMotion || "zoom_in"}`
        )
        .join("\n");

      const prompt = `Bạn là Đạo diễn Hậu kỳ Video Quảng cáo chuyên nghiệp (Commercial Video Editor).
Dưới đây là chuỗi ${scenesCount} phân cảnh video quảng cáo thương mại 9:16:
${scenesContext}

YÊU CẦU: Hãy phân tích mạch cảm xúc và nhịp độ giữa từng cặp phân cảnh liền kề để lựa chọn hiệu ứng chuyển cảnh mềm mại hoặc CẮT THẲNG (tổng cộng ${count} điểm chuyển cảnh).
LƯU Ý ĐẶC BIỆT: TUYỆT ĐỐI KHÔNG DÙNG HIỆU ỨNG PAN / SLIDE / WIPE (trượt ngang/gạt hình) vì sẽ làm giật và rách khung hình.

CHỈ ĐƯỢC CHỌN 1 TRONG 3 KIỂU CHUYỂN CẢNH SAU:
- "none" (Cắt dứt khoát / Hard Cut): Giữ nhịp nhanh, dứt khoát, hoàn hảo từ cảnh Hook mở đầu sang chi tiết sản phẩm. Thời lượng: 0s.
- "fade" (Hòa tan mềm mại / Crossfade 0.35s): Chuyển tiếp êm dịu, mượt mà giữa các cảnh sinh hoạt và trải nghiệm thực tế.
- "fadeblack" (Nháy tối điện ảnh / Dip to Black 0.35s): Chuyển tiếp mờ tối sang cảnh kế tiếp hoặc cảnh kêu gọi hành động CTA chốt đơn.

Hãy trả về DUY NHẤT một mảng JSON gồm chính xác ${count} phần tử với định dạng:
[
  {
    "fromIndex": 0,
    "toIndex": 1,
    "transition": "none" | "fade" | "fadeblack",
    "duration": 0 hoặc 0.35,
    "reason": "Giải thích ngắn gọn 1 câu bằng tiếng Việt lý do chọn hiệu ứng này"
  }
]`;

      const aiText = await callGeminiVisionText(apiKey, prompt, undefined, visionConfig, model || "gemini-3.7-flash");
      const cleanJson = aiText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length === count) {
        console.log(`🤖 [AI Transition Analyzer] Đã phân tích thành công ${parsed.length} điểm chuyển cảnh thông minh.`);
        return parsed.map((item, idx) => {
          let trans = typeof item.transition === "string" ? item.transition.toLowerCase() : "fade";
          // Sanitize: enforce no pan/slide
          if (trans.includes("slide") || trans.includes("wipe") || trans.includes("zoom")) {
            trans = "fade";
          }
          return {
            fromIndex: idx,
            toIndex: idx + 1,
            transition: trans === "none" ? "none" : trans === "fadeblack" ? "fadeblack" : "fade",
            duration: trans === "none" ? 0 : 0.35,
            reason: item.reason || "AI tự động tối ưu hóa nhịp phim mượt mà không giật",
          };
        });
      }
    } catch (aiErr: any) {
      console.warn("⚠️ [AI Transition Analyzer] AI phân tích thất bại, dùng bộ quy tắc thích ứng dự phòng:", aiErr?.message);
    }

    // Rule-based heuristic fallback (100% smooth without pan/slide jitter):
    // Scene 1 -> 2: Hard Cut (clean, fast)
    // Scene 2 -> 3: Crossfade (smooth 0.35s)
    // Scene 3 -> 4: Crossfade (smooth 0.35s)
    // Scene 4 -> 5: Dip to black / Crossfade (0.35s)
    return Array.from({ length: count }, (_, idx) => {
      if (idx === 0) {
        return {
          fromIndex: 0,
          toIndex: 1,
          transition: "none",
          duration: 0,
          reason: "Cắt trực diện (Hard Cut) dứt khoát từ cảnh Hook mở đầu sang chi tiết mở hộp không giật khung hình.",
        };
      } else if (idx === count - 1) {
        return {
          fromIndex: idx,
          toIndex: idx + 1,
          transition: "fadeblack",
          duration: 0.35,
          reason: "Nháy tối điện ảnh (Dip to Black) êm mắt trước khi chuyển sang cảnh kết thúc kêu gọi hành động CTA.",
        };
      } else {
        return {
          fromIndex: idx,
          toIndex: idx + 1,
          transition: "fade",
          duration: 0.35,
          reason: "Hòa tan mềm mại (Crossfade 0.35s) êm dịu, không giật hình khi chuyển tiếp giữa các bối cảnh đời thường.",
        };
      }
    });
  }

  // Endpoint to merge multiple scene video URLs into 1 complete video using FFmpeg & AI Smart Transitions
  app.post("/api/video/merge-scenes", async (req, res) => {
    try {
      const {
        videoUrls,
        scenes,
        transitionMode = "auto",
        customTransitions,
        aspectRatio = "9:16",
        apiKey,
        visionConfig,
      } = req.body;

      if (!Array.isArray(videoUrls) || videoUrls.length === 0) {
        return res.status(400).json({ error: "Danh sách videoUrls không được để trống" });
      }

      const validUrls = videoUrls.filter((u) => typeof u === "string" && u.trim().length > 0);
      if (validUrls.length === 0) {
        return res.status(400).json({ error: "Không tìm thấy URL video hợp lệ để ghép" });
      }

      console.log(`🎬 [FFmpeg Video Merger] Bắt đầu xử lý ghép ${validUrls.length} phân cảnh (Chế độ chuyển cảnh: ${transitionMode})...`);

      const tempDir = path.join(os.tmpdir(), `merge_video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // Step 1: Download or copy each video clip
      const downloadedFiles: string[] = [];
      for (let i = 0; i < validUrls.length; i++) {
        const rawUrl = validUrls[i].trim();
        const clipPath = path.join(tempDir, `clip_${i}.mp4`);

        // Check if local file exists on disk
        const localPathCandidate = path.isAbsolute(rawUrl) ? rawUrl : path.join(process.cwd(), rawUrl);
        if (fs.existsSync(localPathCandidate) && fs.statSync(localPathCandidate).isFile()) {
          console.log(`📁 [FFmpeg Merger] Dùng file video cục bộ ${i + 1}/${validUrls.length}: ${localPathCandidate}`);
          fs.copyFileSync(localPathCandidate, clipPath);
          downloadedFiles.push(clipPath);
          continue;
        }

        let targetUrl = rawUrl;
        if (targetUrl.startsWith("/")) {
          targetUrl = `http://localhost:${PORT}${targetUrl}`;
        }

        console.log(`📥 [FFmpeg Merger] Đang tải clip ${i + 1}/${validUrls.length}: ${targetUrl.slice(0, 80)}...`);
        const fetchRes = await fetch(targetUrl, {
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept": "*/*",
          },
        });

        if (!fetchRes.ok) {
          throw new Error(`Không thể tải video phân cảnh ${i + 1} (${fetchRes.status} ${fetchRes.statusText})`);
        }

        const arrayBuf = await fetchRes.arrayBuffer();
        fs.writeFileSync(clipPath, Buffer.from(arrayBuf));
        downloadedFiles.push(clipPath);
      }

      // Step 2: Query exact duration of each clip with ffprobe
      const clipDurations: number[] = [];
      for (let i = 0; i < downloadedFiles.length; i++) {
        const dur = await getClipDurationSeconds(downloadedFiles[i]);
        clipDurations.push(dur);
        console.log(`⏱️ Clip ${i + 1} duration: ${dur.toFixed(2)}s`);
      }

      // Step 3: AI Transition Decision
      let chosenTransitions: Array<{
        fromIndex: number;
        toIndex: number;
        transition: string;
        duration: number;
        reason: string;
      }> = [];

      if (Array.isArray(customTransitions) && customTransitions.length === downloadedFiles.length - 1) {
        chosenTransitions = customTransitions;
      } else {
        chosenTransitions = await analyzeTransitionsWithAI({
          scenesCount: downloadedFiles.length,
          scenes: Array.isArray(scenes) ? scenes : undefined,
          transitionMode,
          apiKey,
          visionConfig,
        });
      }

      // Step 4: Build FFmpeg command with xfade filter chain
      const outputFilename = `final_video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
      const outputPath = path.join(tempDir, outputFilename);

      const width = aspectRatio === "16:9" ? 1920 : aspectRatio === "1:1" ? 1080 : 1080;
      const height = aspectRatio === "16:9" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;

      // Normalize inputs: scale, pad, fps=30, setsar=1
      const normalizedInputs = downloadedFiles
        .map(
          (_, idx) =>
            `[${idx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${idx}];`
        )
        .join("");

      // Check if all transitions are hard cut or transitionMode is cut
      const isPureCut = transitionMode === "cut" || chosenTransitions.every((t) => t.transition === "none" || t.duration <= 0);

      let filterComplex = "";
      if (isPureCut) {
        // Simple and 100% robust hard cut stream concatenation
        const concatStreams = downloadedFiles.map((_, idx) => `[v${idx}]`).join("");
        filterComplex = `${normalizedInputs}${concatStreams}concat=n=${downloadedFiles.length}:v=1:a=0[outv]`;
      } else {
        // Chained xfade filter graph with frame-safe duration and offsets
        let currentStream = `[v0]`;
        let accumulatedTime = clipDurations[0];
        const filterSteps: string[] = [];

        for (let i = 0; i < downloadedFiles.length - 1; i++) {
          const tr = chosenTransitions[i] || { transition: "fade", duration: 0.35 };
          const nextStream = `[v${i + 1}]`;
          const outStream = i === downloadedFiles.length - 2 ? `[outv]` : `[v_xf_${i}]`;
          
          const isCut = tr.transition === "none" || tr.duration <= 0;
          const transType = isCut ? "fade" : tr.transition;
          const transDur = isCut ? 0.15 : Math.min(Math.max(tr.duration, 0.2), 0.5);
          
          // Ensure offset strictly satisfies: offset + transDur <= accumulatedTime
          const maxAllowedOffset = Math.max(0.1, accumulatedTime - transDur);
          const offset = maxAllowedOffset;

          filterSteps.push(
            `${currentStream}${nextStream}xfade=transition=${transType}:duration=${transDur.toFixed(
              3
            )}:offset=${offset.toFixed(3)}${outStream}`
          );
          accumulatedTime = accumulatedTime + clipDurations[i + 1] - transDur;
          currentStream = outStream;
        }

        filterComplex = `${normalizedInputs}${filterSteps.join(";")}`;
      }

      const ffmpegArgs = [
        "-y",
        ...downloadedFiles.flatMap((f) => ["-i", f]),
        "-filter_complex",
        filterComplex,
        "-map",
        "[outv]",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputPath,
      ];

      console.log(`⚙️ [FFmpeg Merger] Thực thi lệnh: ffmpeg ${ffmpegArgs.join(" ")}`);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn("ffmpeg", ffmpegArgs, { windowsHide: true });
        let stderr = "";
        proc.stderr?.on("data", (d) => {
          stderr += d.toString();
        });
        proc.on("close", (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve();
          } else {
            console.error("FFmpeg error log:", stderr.slice(-1000));
            reject(new Error(`Lỗi FFmpeg khi ghép video (Mã lỗi: ${code}). ${stderr.slice(-300)}`));
          }
        });
        proc.on("error", (err) => {
          reject(err);
        });
      });

      const mergedId = `merged_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      mergedVideosCache.set(mergedId, {
        filePath: outputPath,
        createdAt: Date.now(),
        mimeType: "video/mp4",
      });

      const mergedVideoUrl = `/api/video/merged/${mergedId}.mp4`;
      console.log(`✅ [FFmpeg Merger] Ghép video thành công! (${mergedVideoUrl})`);

      return res.json({
        success: true,
        mergedId,
        videoUrl: mergedVideoUrl,
        clipsCount: downloadedFiles.length,
        transitions: chosenTransitions,
        message: `Đã ghép thành công ${downloadedFiles.length} phân cảnh thành 1 video hoàn chỉnh với chuyển cảnh thông minh!`,
      });
    } catch (err: any) {
      console.error("❌ [FFmpeg Video Merge Error]:", err);
      return res.status(500).json({
        error: err?.message || "Lỗi khi ghép video bằng FFmpeg",
      });
    }
  });

  // Serve merged video file with streaming range support
  app.get("/api/video/merged/:id", (req, res) => {
    const rawId = req.params.id.replace(/\.[a-zA-Z0-9]+$/, "");
    const item = mergedVideosCache.get(rawId) || mergedVideosCache.get(req.params.id);
    if (!item || !fs.existsSync(item.filePath)) {
      return res.status(404).send("Video đã ghép không tồn tại hoặc đã bị dọn dẹp.");
    }

    const stat = fs.statSync(item.filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(item.filePath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      };
      res.writeHead(200, head);
      fs.createReadStream(item.filePath).pipe(res);
    }
  });

  // Dictionary-based smart translator to ensure diffusion models accurately interpret product/clothing intents
  function enrichPromptWithEnglish(prompt: string): string {
    const p = prompt.trim();
    if (!p) return "";
    const pLower = p.toLowerCase();
    const additions: string[] = [];

    // Tạp dề / Kitchen Apron
    if (pLower.includes("tạp dề") || pLower.includes("tap de") || pLower.includes("apron") || pLower.includes("nấu ăn") || pLower.includes("làm bếp")) {
      additions.push("a kitchen cooking apron with clean cloth drape, neck strap, waist ties, chest bib, and the exact front printed artwork, graphics, and color pattern transferred from the reference");
    }

    // Jewelry & Wearables
    if (pLower.includes("vòng tay") || pLower.includes("lắc tay") || pLower.includes("vòng đeo tay")) {
      if (pLower.includes("tết da") || pLower.includes("da")) {
        additions.push("a premium braided black leather wrist bracelet with a polished silver magnetic clasp worn around the wrist");
      } else if (pLower.includes("vàng") || pLower.includes("gold")) {
        additions.push("an elegant 18k solid gold wrist bracelet worn on the wrist with rich reflective golden luster");
      } else if (pLower.includes("bạc") || pLower.includes("silver")) {
        additions.push("a sleek 925 sterling silver chain bracelet visibly worn on the wrist");
      } else {
        additions.push("a stylish wearable wrist bracelet worn snugly on the subject's wrist with detailed clasp and realistic lighting");
      }
    } else if (pLower.includes("đồng hồ")) {
      additions.push("a luxury chronograph wristwatch with sapphire glass dial and leather or stainless steel strap worn on the wrist");
    } else if (pLower.includes("dây chuyền") || pLower.includes("vòng cổ")) {
      additions.push("an elegant pendant necklace worn around the neck");
    } else if (pLower.includes("nhẫn")) {
      additions.push("a luxury jewelry ring worn on the finger with reflective metal finish");
    } else if (pLower.includes("túi xách") || pLower.includes("túi") || pLower.includes("balo")) {
      additions.push("a luxury leather designer handbag held by hand or on shoulder");
    }

    // Garments & Clothing
    if (pLower.includes("vest") || pLower.includes("suit")) {
      additions.push("a bespoke tailored navy or charcoal business suit jacket with crisp collar and dress shirt");
    } else if (pLower.includes("sơ mi")) {
      additions.push("a clean, perfectly pressed button-up cotton dress shirt");
    } else if (pLower.includes("đầm") || pLower.includes("váy")) {
      additions.push("an elegant flowing evening gown/dress with natural textile folds and flattering fit");
    } else if (pLower.includes("áo dài")) {
      additions.push("a traditional silk Vietnamese Ao Dai with high collar and graceful drapery");
    } else if (pLower.includes("áo thun") || pLower.includes("áo phông")) {
      additions.push("a premium fitted crewneck cotton t-shirt");
    } else if (pLower.includes("áo khoác") || pLower.includes("jacket")) {
      additions.push("a modern stylish outerwear jacket");
    }

    // Micro-detail & Anti-blur directives
    additions.push("faithfully preserving all micro-patterns, fine embroidery stitches, border seams, authentic fabric texture, and crisp vector-like typography from the reference without blur or distortion");

    if (additions.length > 0) {
      return `${p} (Directives: ${additions.join("; ")})`;
    }
    return p;
  }

  // Multimodal visual inspector to compare Image 1 (base) and Image 2..N (product references)
  async function inspectReplacementPair(params: {
    ai: GoogleGenAI | null;
    openAiConfig?: {
      apiKey: string;
      baseUrl: string;
    };
    baseOriginal: string;
    originalMimeType: string;
    productRefs: Array<{ refIndex: number; name: string; mimeType: string; data: string }>;
    outfitPrompt?: string;
    characterPrompt?: string;
    enableCharacter: boolean;
  }): Promise<string | null> {
    const {
      ai,
      openAiConfig,
      baseOriginal,
      originalMimeType,
      productRefs,
      outfitPrompt,
      characterPrompt,
      enableCharacter,
    } = params;

    if (productRefs.length === 0) return null;

    // 1. Try Gemini Flash if ai client is available
    if (ai) {
      try {
        const parts: any[] = [
          {
            inlineData: {
              mimeType: originalMimeType,
              data: baseOriginal,
            },
          },
          ...productRefs.map((p) => ({
            inlineData: {
              mimeType: p.mimeType,
              data: p.data,
            },
          })),
          {
            text: `You are an expert AI vision analyst for image editing, microscopic textile analysis, and zero-loss product replacement.
Input images:
- Image 1: The ground-truth base photo.
- Image 2${productRefs.length > 1 ? ` to Image ${productRefs.length + 1}` : ""}: Target product reference(s) to replace into Image 1.

Analyze both images carefully and provide 4 concise bullet points in English:
1. TARGET PRODUCT & MICRO-DETAILS: Specifically describe the product in Image 2 (exact colors, intricate micro-patterns, embroidery threads, tiny illustrations, typography/text with exact spelling, stitches, borders, straps, and fabric weave).
2. SOURCE ITEM IN IMAGE 1 TO REPLACE: Identify the corresponding item in Image 1 that must be replaced. Explicitly state that ALL old text, names, graphics, and embroidery on this item in Image 1 MUST BE 100% COMPLETELY ERASED with zero residual.
3. PRESERVATION OF SMALL DETAILS: Explicitly instruct to render all micro-motifs, fine borders, and lettering from Image 2 with razor-sharp vector clarity, preventing any blur, smoothing, or distortion.
4. INPAINTING DIRECTIVE: Clearly state how to render the product from Image 2 into Image 1 (${enableCharacter && characterPrompt ? `the newly modified character (${characterPrompt}) must be wearing this new product` : "maintain the exact same position/hanging display without adding people"}).
${outfitPrompt ? `User request notes: "${outfitPrompt}"` : ""}

Keep your output concise, precise, and directly actionable for an inpainting model.`,
          },
        ];

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: { parts },
        });
        clearTimeout(timeout);

        const text = res.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text || "")
          .join(" ")
          .trim();

        if (text && text.length > 25) {
          console.log("Vision Inspector (Gemini Flash) identified:", text);
          return text;
        }
      } catch (geminiFlashErr) {
        console.warn("Vision inspection via gemini-3.8-flash timed out or failed:", geminiFlashErr);
      }
    }

    // 2. Try OpenAI Vision (gpt-4o-mini) if OpenAI / MN API key is provided
    if (openAiConfig && openAiConfig.apiKey) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);

        const chatRes = await fetch(`${openAiConfig.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiConfig.apiKey.trim()}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analyze Image 1 (ground-truth photo) and Image 2 (target product reference to wear/place). Provide 3 concise actionable bullet points in English:
1. TARGET PRODUCT DETAILS: Specifically describe the product in Image 2 (garment type, exact colors, pattern, typography, straps, fabric).
2. SOURCE ITEM TO REPLACE IN IMAGE 1: Identify the item in Image 1 that must be erased. All old text/embroidery must be completely erased.
3. INPAINTING DIRECTIVE: Specify how to render Image 2's product into Image 1 (${enableCharacter && characterPrompt ? `the modified subject (${characterPrompt}) must be visibly wearing this replacement product` : "place or replace the item in the scene naturally"}).
${outfitPrompt ? `User notes: "${outfitPrompt}"` : ""}`,
                  },
                  {
                    type: "image_url",
                    image_url: { url: `data:${originalMimeType};base64,${baseOriginal}` },
                  },
                  {
                    type: "image_url",
                    image_url: { url: `data:${productRefs[0].mimeType};base64,${productRefs[0].data}` },
                  },
                ],
              },
            ],
            max_tokens: 300,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (chatRes.ok) {
          const chatJson = await chatRes.json();
          const reply = chatJson?.choices?.[0]?.message?.content?.trim();
          if (reply && reply.length > 25) {
            console.log("Vision Inspector (OpenAI Vision via API Key) identified:", reply);
            return reply;
          }
        }
      } catch (openAiVisionErr) {
        console.warn("Vision inspection via OpenAI/MN API timed out or failed:", openAiVisionErr);
      }
    }

    // 3. Semantic synthesis based on filenames and prompt keywords (Zero extra API calls, instant & robust)
    const pNames = productRefs.map((p) => p.name.toLowerCase()).join(" ");
    const userP = (outfitPrompt || "").toLowerCase();
    const combined = `${pNames} ${userP}`;

    if (combined.includes("apron") || combined.includes("tap") || combined.includes("bep") || combined.includes("cook")) {
      return "Target product is a kitchen apron. Completely remove the existing apron in Image 1, erasing all old embroidery, names, and patterns. Render the replacement apron matching the exact fabric pattern, colors, and straps from reference Image 2.";
    }
    if (combined.includes("bracelet") || combined.includes("vong") || combined.includes("lac")) {
      return "Target product is a wrist bracelet/accessory. Place the exact bracelet from reference Image 2 onto the subject's wrist with realistic metallic luster and shadows, replacing any conflicting old accessory.";
    }
    if (combined.includes("shirt") || combined.includes("ao") || combined.includes("dress") || combined.includes("vay")) {
      return "Target product is clothing/garment. Replace the subject's worn clothing with the exact garment from reference Image 2, matching its fabric texture, colors, and drape.";
    }

    return `Target product reference: replace the corresponding worn or displayed item in Image 1 with the exact product from Image 2, erasing all old graphics and text from the original item.`;
  }

  // Ensure output image strictly conforms to requested 9:16 aspect ratio
  async function ensureAspectRatio(
    base64DataUrl: string,
    targetAspect: string
  ): Promise<string> {
    if (targetAspect !== "9:16") return base64DataUrl;

    try {
      const cleanB64 = base64DataUrl.includes(",") ? base64DataUrl.split(",")[1] : base64DataUrl;
      const inBuffer = Buffer.from(cleanB64, "base64");
      const meta = await sharp(inBuffer).metadata();
      if (!meta.width || !meta.height) return base64DataUrl;

      const currentRatio = meta.width / meta.height;
      // 9:16 is 0.5625. If currentRatio is close to 9:16 (0.52 to 0.60), keep as is
      if (currentRatio >= 0.52 && currentRatio <= 0.60) {
        return base64DataUrl;
      }

      // If image is square (e.g. 1.0) or landscape, format into 9:16 vertical canvas (1080x1920)
      const targetWidth = 1080;
      const targetHeight = 1920;

      // Create a blurred ambient background from the image itself
      const blurredBg = await sharp(inBuffer)
        .resize(targetWidth, targetHeight, { fit: "cover" })
        .blur(25)
        .modulate({ brightness: 0.65 })
        .toBuffer();

      // Fit main image cleanly in center of vertical canvas
      const fittedForeground = await sharp(inBuffer)
        .resize(targetWidth, targetHeight, { fit: "contain" })
        .toBuffer();

      const composited = await sharp(blurredBg)
        .composite([{ input: fittedForeground, gravity: "center" }])
        .png({ quality: 95 })
        .toBuffer();

      return `data:image/png;base64,${composited.toString("base64")}`;
    } catch (err) {
      console.warn("Could not adjust aspect ratio with sharp:", err);
      return base64DataUrl;
    }
  }

  // Helper to describe uploaded outfit/product image using prompt keywords and semantic enrichment
  function describeOutfitOrProduct(
    productName: string,
    userPrompt?: string
  ): string {
    const rawPrompt = userPrompt?.trim() || "";
    const enrichedUserPrompt = enrichPromptWithEnglish(rawPrompt);

    // If user provided a descriptive prompt, return it with English enrichment
    if (rawPrompt.length > 25 && !rawPrompt.includes("Khoác lên trang phục giống hệt mẫu")) {
      return enrichedUserPrompt;
    }

    const nameEnriched = enrichPromptWithEnglish(productName || "");
    if (nameEnriched && nameEnriched !== productName) {
      return nameEnriched;
    }

    return (
      enrichedUserPrompt ||
      "the target product reference item matching the exact pattern, color, and texture"
    );
  }

  // Image replacement and editing endpoint
  app.post("/api/generate-replacement", async (req, res) => {
    try {
      const {
        provider = "gpt-image-2", // Default to OpenLux AI / GPT-Image-2
        gptImageConfig,
        originalImageBase64, // pure base64 or data URL (ref1)
        originalMimeType = "image/jpeg",
        productImages = [], // array of references [ref2, ref3, ...] { data: string, mimeType?: string, name?: string } or string base64
        characterPrompt = "",
        productName = "",
        outfitPrompt = "",
        backgroundPrompt = "",
        outfitImageBase64 = null, // legacy fallback for single reference
        outfitMimeType = "image/jpeg",
        enableCharacter = true,
        enableOutfit = true,
        enableBackground = true,
        removeSubtitles = true,
        preserveBackground = true,
        preservePose = true,
        stylePreset = "photorealistic",
        aspectRatio = "1:1",
        prompt = "",
        customPrompt = "",
        apiKey = "",
        selectedModel = "gemini-3.1-flash-image",
      } = req.body;

      const activeDirectPrompt = (prompt || customPrompt || "").trim();

      if (!originalImageBase64) {
        return res.status(400).json({
          error: "Thiếu dữ liệu hình ảnh gốc (originalImageBase64 is required)",
        });
      }

      // Determine effective provider: if Gemini is requested but the key is an OpenLux sk- key or not native AIzaSy, auto-switch to OpenLux AI (gpt-image-2)
      let effectiveProvider = provider;
      const headerGeminiKey = req.headers["x-gemini-api-key"] as string | undefined;
      const testGeminiKey = (apiKey && apiKey.trim()) || (headerGeminiKey && headerGeminiKey.trim()) || process.env.GEMINI_API_KEY || "";
      if (effectiveProvider === "gemini" && !testGeminiKey.startsWith("AIzaSy")) {
        console.log("ℹ️ [Smart Provider Router] Phát hiện khóa OpenLux (sk-...), tự động chuyển chế độ sang OpenLux AI / GPT-Image-2.");
        effectiveProvider = "gpt-image-2";
      }

      // Clean base64 string or fetch remote image URL (e.g. from Google Drive) to base64
      const resolveBase64 = async (str: string): Promise<string> => {
        if (!str) return "";
        if (str.startsWith("http://") || str.startsWith("https://")) {
          try {
            const resp = await fetch(str);
            if (resp.ok) {
              const arrayBuf = await resp.arrayBuffer();
              return Buffer.from(arrayBuf).toString("base64");
            }
          } catch (e) {
            console.warn("Lỗi tải ảnh từ URL:", str, e);
          }
        }
        if (str.includes(",")) {
          return str.split(",")[1];
        }
        return str;
      };

      const baseOriginal = await resolveBase64(originalImageBase64);

      // Normalize multi-reference images: image[ref1, ref2, ...]
      // ref1 is ALWAYS originalImageBase64 (the original photo)
      // ref2, ref3, ... are product/garment/accessory reference images to replace into ref1
      interface NormalizedProductRef {
        refIndex: number;
        data: string;
        mimeType: string;
        name: string;
      }

      const rawProductList = Array.isArray(productImages) ? productImages : [];
      const resolvedProductRefs = await Promise.all(
        rawProductList.map(async (item: any, idx: number) => {
          const dataStr = typeof item === "string" ? item : (item.data || item.dataUrl || item.previewUrl || "");
          const mime = (typeof item === "object" && item.mimeType) || "image/jpeg";
          const name = (typeof item === "object" && item.name) || `Sản phẩm ${idx + 1}`;
          const cleanData = await resolveBase64(dataStr);
          return {
            refIndex: idx + 2, // ref2, ref3, ...
            data: cleanData,
            mimeType: mime,
            name,
          };
        })
      );

      let normalizedProductRefs: NormalizedProductRef[] = resolvedProductRefs.filter(
        (p) => p.data && p.data.length > 20
      );

      // Legacy fallback: if productImages was empty but outfitImageBase64 was provided
      if (normalizedProductRefs.length === 0 && outfitImageBase64) {
        const cleanedLegacy = await resolveBase64(outfitImageBase64);
        if (cleanedLegacy) {
          normalizedProductRefs.push({
            refIndex: 2,
            data: cleanedLegacy,
            mimeType: outfitMimeType || "image/jpeg",
            name: "Sản phẩm tham chiếu",
          });
        }
      }

      console.log("\n=======================================================");
      console.log("📥 [YÊU CẦU TẠO ẢNH: /api/generate-replacement]");
      console.log("Thời gian:", new Date().toLocaleString("vi-VN"));
      console.log("Động cơ / Provider:", provider);
      console.log("Tỉ lệ khung hình (aspectRatio):", aspectRatio);
      console.log("Hình ảnh gốc (Image 1):", `${originalMimeType} (~${Math.round(baseOriginal.length * 0.75 / 1024)} KB)`);
      console.log(
        "Sản phẩm tham chiếu:",
        normalizedProductRefs.length > 0
          ? normalizedProductRefs.map((p) => `ref${p.refIndex} [${p.name}]`).join(", ")
          : "(không có sản phẩm đính kèm)"
      );
      console.log("Nhân vật thay thế:", characterPrompt || "(giữ nguyên nhân vật gốc)");
      console.log("Trang phục / Sản phẩm:", outfitPrompt || "(tự động nhận diện từ ảnh mẫu)");
      console.log("Xóa phụ đề vietsub:", removeSubtitles ? "Có" : "Không");
      console.log("Bối cảnh:", backgroundPrompt ? `Thay đổi -> "${backgroundPrompt}"` : (preserveBackground ? "Giữ bối cảnh gốc" : "Tự do"));
      console.log("Giữ tư thế gốc:", preservePose ? "Có" : "Không");
      console.log("Phong cách:", stylePreset);
      console.log("=======================================================\n");

      // --- BRANCH A: GPT-IMAGE-2 (OpenAI / OpenLux AI) ---
      if (effectiveProvider === "gpt-image-2") {
        const headerOpenAiKey = req.headers["x-openai-api-key"] as string | undefined;
        const effectiveGptKey =
          (gptImageConfig?.apiKey && gptImageConfig.apiKey.trim()) ||
          (headerOpenAiKey && headerOpenAiKey.trim()) ||
          process.env.OPENAI_API_KEY;

        if (!effectiveGptKey) {
          return res.status(400).json({
            error: "Chưa cấu hình API Key cho GPT-Image-2. Vui lòng mở mục 'Cấu hình API & Key', chọn tab 'GPT-Image-2' và nhập API Key của bạn.",
            needsApiKey: true,
            provider: "gpt-image-2",
          });
        }

        const { editUrl, baseUrl: targetBaseUrl } = normalizeEditsEndpoint(gptImageConfig?.baseUrl);
        const gptModel = gptImageConfig?.model || "gpt-image-2";
        const gptQuality = gptImageConfig?.quality || "medium";

        // Determine size: prioritize user's explicit size in gptImageConfig, else map aspect ratio with 1152x2048 default for 9:16
        let gptSize = gptImageConfig?.size?.trim();
        if (!gptSize) {
          if (aspectRatio === "9:16") {
            gptSize = "1152x2048";
          } else if (aspectRatio === "3:4") {
            gptSize = "1024x1365";
          } else if (aspectRatio === "16:9") {
            gptSize = "2048x1152";
          } else if (aspectRatio === "4:3") {
            gptSize = "1365x1024";
          } else {
            gptSize = "1024x1024";
          }
        }

        // Run vision inspection to analyze Image 1 (base) and Image 2..N (product references)
        const visionSummary = await inspectReplacementPair({
          ai: getGeminiClient(),
          openAiConfig: {
            apiKey: effectiveGptKey,
            baseUrl: targetBaseUrl,
          },
          baseOriginal,
          originalMimeType,
          productRefs: normalizedProductRefs,
          outfitPrompt,
          characterPrompt,
          enableCharacter,
        });

        // Resolve descriptive outfit/product details using prompt & keywords for all references
        let resolvedOutfitDesc = "";
        if (enableOutfit && normalizedProductRefs.length > 0) {
          const descs = normalizedProductRefs.map((prod) => {
            const desc = describeOutfitOrProduct(
              prod.name,
              outfitPrompt
            );
            return `• ref${prod.refIndex} (Image ${prod.refIndex}) [${prod.name}]: ${desc}`;
          });
          resolvedOutfitDesc = descs.join("\n");
          if (visionSummary) {
            resolvedOutfitDesc = `${visionSummary}\n\n${resolvedOutfitDesc}`;
          }
          if (productName && productName.trim()) {
            resolvedOutfitDesc = `Target Product Name: "${productName.trim()}"\n${resolvedOutfitDesc}`;
          }
          if (outfitPrompt && outfitPrompt.trim()) {
            resolvedOutfitDesc += `\nAdditional user notes: ${outfitPrompt.trim()}`;
          }
        } else if (enableOutfit && (productName || outfitPrompt)) {
          resolvedOutfitDesc = [
            productName && productName.trim() ? `Target Product: ${productName.trim()}` : "",
            outfitPrompt && outfitPrompt.trim() ? outfitPrompt.trim() : "",
          ].filter(Boolean).join("\n");
        }

        const primaryOutfitMandate = enableOutfit
          ? (enableCharacter
            ? `CRITICAL MANDATORY TASK - 100% PRODUCT VISUAL REPLACEMENT (HIGHEST PRIORITY):
- Both Image 1 (original scene photo) and Image 2 (replacement product reference) are provided directly as visual references.
- YOUR PRIMARY OBJECTIVE: Replace the corresponding product, garment, accessory, or object in Image 1 with the exact product shown in Image 2!
- DO NOT describe, re-interpret, or invent any design details. Look directly at reference Image 2 and copy 100% of its visual design, prints, graphics, colors, shape, and structure.
- SURGICAL REPLACEMENT:
  * Locate the corresponding item/product in Image 1 (whether worn by the subject, held in hand, or placed in the scene).
  * COMPLETELY ERASE and REMOVE this original item and ALL of its text, embroidery, and conflicting artwork from Image 1.
  * Render the exact replacement product from Image 2 (image2) with 100% photographic fidelity.
  * HIGHEST PRIORITY: DO NOT KEEP THE OLD PRODUCT/CLOTHING FROM IMAGE 1! The final image MUST feature the exact product from Image 2!`
            : `CRITICAL MANDATE - 100% UNIVERSAL PRODUCT REPLACEMENT CLONE (NO CHARACTER ALTERATION):
- Both Image 1 (original photo) and Image 2 (product reference) are provided directly as visual references.
- YOUR PRIMARY OBJECTIVE: Replace the corresponding product, item, prop, or garment in Image 1 with the exact product shown in Image 2.
- DO NOT describe, re-interpret, or invent any design details. Copy 100% of the visual design directly from Image 2.
- SURGICAL REPLACEMENT: Identify the target product in Image 1. COMPLETELY ERASE all old text, embroidery, patterns, and old shapes from this item in Image 1!
- Render the replacement product matching 100% of the exact artwork, print pattern, texture, and colors directly from Image 2.
- If the original photo has a person wearing or holding the product: Keep their exact face, facial features, hair, identity, body, and pose 100% UNCHANGED. Only replace the product/clothing.
- If the original photo does NOT have a person (e.g. product on a table, shelf, studio background, flat lay): Simply replace the displayed item in place with the exact product from Image 2 in the same environment, lighting, and background composition.`)
          : "PRESERVE ORIGINAL PRODUCT & CLOTHING: Keep existing items and scene props completely unchanged.";

        const characterRequirement = enableCharacter
          ? (characterPrompt && characterPrompt.trim()
            ? `CHARACTER MODIFICATION:
- Modify the subject to match: "${characterPrompt.trim()}".
- Seamlessly replace the face, facial features, hair, and age while keeping the natural head tilt, body pose, hand gesture, and emotional expression from Image 1.
- CRITICAL: Even though her face/identity is changed, HER CLOTHING MUST BE THE REPLACEMENT PRODUCT FROM IMAGE 2 (ref2). Do NOT retain the clothing from Image 1 on the new character.`
            : "CHARACTER: Retain natural character appearance, face, and body pose from Image 1.")
          : `STRICT PROHIBITION - DO NOT ADD OR CHANGE ANY PERSON OR CHARACTER:
- DO NOT generate, invent, or add any new person, model, face, or human character into the image.
- If the source image contains a person, keep their identity, face, eyes, hair, age, and biological features 100% UNCHANGED.
- If the source image contains NO person, DO NOT add any human person. Only replace the product or clothing.`;

        const framingInstruction = enableCharacter
          ? "COMPOSITION & FRAMING: Vertical 9:16 mobile aspect ratio portrait framing (TikTok/Reels format). Clear view of the character, their upper body, hands, and the replaced outfit/product."
          : "COMPOSITION & FRAMING: Vertical 9:16 mobile aspect ratio framing. Focus strictly on the product and outfit replacement in the original composition. DO NOT introduce any new human models or people.";

        const hasBgChange = Boolean(backgroundPrompt && backgroundPrompt.trim());
        const backgroundDirective = hasBgChange
          ? `BACKGROUND REPLACEMENT DIRECTIVE (ONLY CHANGE BACKGROUND, STRICTLY LOCK FOREGROUND & POSITION):
- ONLY replace the background scenery and environment behind/around the subject with: "${backgroundPrompt.trim()}".
- CRITICAL POSITION & SUBJECT LOCK: Keep the EXACT spatial position, canvas coordinates, framing, scale, and bounding box of the person/character and product 100% UNCHANGED from Image 1. DO NOT move, shift, re-center, or re-scale the character or product.
- Keep the character's body pose, head tilt, face, gestures, and the worn/displayed product in their exact original pixel location.
- Only inpaint the new background around the subject, integrating realistic contact shadows, depth-of-field, and ambient lighting seamlessly.`
          : (preserveBackground ? "BACKGROUND PRESERVATION: Keep the exact background environment, room lighting, depth-of-field, and cinematic atmosphere identical to Image 1." : "");

        const productDesignLockMandate = `ABSOLUTE 1:1 PRODUCT DESIGN CLONE MANDATE (ZERO DEVIATION / NO REDESIGN):
- EXACT DESIGN IDENTITY: The replacement product in the new image MUST be an UNMODIFIED 1:1 VISUAL CLONE of the exact product design from Image 2.
- STRICT PROHIBITION OF CREATIVE ALTERATIONS: DO NOT redesign, DO NOT invent new patterns, DO NOT shift colors, DO NOT alter graphic placements, and DO NOT modify logos/text from Image 2.
- 100% REPLICATION: Every floral motif, geometric line, border stitch, strap, pocket, button, and typographic element from Image 2 must appear in the final image with photographic identity, accurately draped over the subject's pose in Image 1.`;

        const microDetailDirectives = `MICRO-DETAIL & TEXTURE FIDELITY MANDATE (1:1 ZERO-LOSS RESOLUTION):
- 1:1 REPLICATION OF SMALL INTRICATE DETAILS: Faithfully preserve all micro-patterns, fine embroidery stitches, delicate border seams, miniature floral/geometric artwork, clasps, buttons, and exact graphic prints from Image 2.
- HARD EDGE CONTOURS & SHARP LOCAL CONTRAST: Do NOT blur, do NOT smooth out, and do NOT blend away tiny motifs. Every small design element from Image 2 must remain crisp, clearly delineated, and recognizable.
- AUTHENTIC TEXTILE GRAIN: Render authentic tactile surface texture (woven canvas threads, leather texture/sheen, metallic luster, silk weave) without plastic or muddy smoothing.
- STRICT PROHIBITION: Absolutely NO blurry patches, NO smeared textures, NO melted small designs, and NO loss of fine lines on the target product.`;

        const typographyDirectives = `TYPOGRAPHY & GRAPHIC DETAIL MANDATE (ULTRA-SHARP VECTOR CLARITY):
- REPLICATE ALL TEXT & NAMES WITH VECTOR-GRADE CLARITY: Every word, title, name, letter, and decorative typography on the replacement product (Image 2) must be rendered with razor-sharp pixel edges, exact spelling, clean distinct font shapes, and zero blur.
- PERFECT FONT ALIGNMENT & CONTRAST: Preserve the distinct colorful typography, font weights, and spacing from Image 2 seamlessly integrated into the cloth texture without bleeding, smearing, or distortion.
- STRICT PROHIBITION OF TYPOGRAPHIC ARTIFACTS: Absolutely NO blurry text, NO smudged lettering, NO distorted or melting font shapes, NO scrambled pseudo-characters, NO hallucinated duplicate names, and NO low-resolution artifacts.`;

        // Build structured prompt matching user specification
        const isCharChange = Boolean(enableCharacter && characterPrompt && characterPrompt.trim());
        const isBgChange = Boolean(backgroundPrompt && backgroundPrompt.trim());

        const promptParts: string[] = [];
        if (isCharChange) {
          promptParts.push(`thay nhân vật thành ${characterPrompt.trim()}`);
        }
        if (isBgChange) {
          promptParts.push(`thay bối cảnh ${backgroundPrompt.trim()}`);
        }
        if (enableOutfit) {
          const targetLabel = (productName && productName.trim()) ? `sản phẩm "${productName.trim()}"` : 'sản phẩm';
          if (normalizedProductRefs.length > 1) {
            const refList = normalizedProductRefs.map((p) => `image${p.refIndex}`).join(', ');
            promptParts.push(`thay ${targetLabel} ở hình ${refList} sang hình image1 (xóa bỏ sản phẩm cũ ở image1 và thay thế chính xác bằng sản phẩm mới từ ${refList})`);
          } else {
            promptParts.push(`thay ${targetLabel} ở hình image2 sang hình image1 (xóa bỏ sản phẩm cũ ở image1 và thay thế chính xác bằng sản phẩm mới từ image2)`);
          }
          if (outfitPrompt && outfitPrompt.trim() && !outfitPrompt.toLowerCase().includes('thay sản phẩm ở hình image2') && !outfitPrompt.toLowerCase().includes('thay sản phẩm ở hình ref2')) {
            promptParts.push(outfitPrompt.trim());
          }
        }
        if (removeSubtitles) {
          promptParts.push('xóa phụ đề subtext trong hình');
        }
        if (!isCharChange && !isBgChange) {
          promptParts.push('giữ nguyên bố cục, ánh sáng, phông nền và người mẫu (nếu có)');
        } else if (!isBgChange) {
          promptParts.push('giữ nguyên bố cục, ánh sáng và phông nền');
        } else if (!isCharChange) {
          promptParts.push('giữ nguyên người mẫu và tư thế (nếu có)');
        }

        // Tỉ lệ khung hình ở cuối prompt (mặc định 9:16)
        promptParts.push(`tỉ lệ khung hình ${aspectRatio || '9:16'}`);

        const promptInstructions = promptParts.join(', ');
        const effectiveGptPrompt = activeDirectPrompt || promptInstructions;

        // Build the cascade candidate list: Primary -> MNAPI Fallback
        interface ProviderCandidate {
          name: string;
          baseUrl: string;
          apiKey: string;
        }

        const endpointKeys = gptImageConfig?.endpointKeys || {};
        const openLuxUrl = "https://api.openlux.ai/v1/images/edits";
        const mnApiUrl = "https://www.mnapi.com/v1/images/edits";
        const defaultOpenLuxKey = "sk-***REVOKED-ROTATE-ME***";
        const defaultMnApiKey = "sk-***REVOKED-ROTATE-ME***";

        // Retrieve OpenLux key (always 1st candidate)
        const openLuxKey =
          (gptImageConfig?.baseUrl?.includes("openlux.ai") && gptImageConfig?.apiKey?.trim()) ||
          endpointKeys[openLuxUrl] ||
          (headerOpenAiKey && headerOpenAiKey.trim()) ||
          process.env.OPENLUX_API_KEY ||
          process.env.OPENAI_API_KEY ||
          defaultOpenLuxKey;

        // Retrieve MNAPI key (always 2nd fallback candidate)
        const mnApiKey =
          (gptImageConfig?.baseUrl?.includes("mnapi.com") && gptImageConfig?.apiKey?.trim()) ||
          endpointKeys[mnApiUrl] ||
          process.env.MNAPI_API_KEY ||
          defaultMnApiKey;

        const candidates: ProviderCandidate[] = [
          {
            name: "OpenLux AI (Mặc định)",
            baseUrl: openLuxUrl,
            apiKey: openLuxKey,
          },
          {
            name: "MNAPI (Tự động dự phòng)",
            baseUrl: mnApiUrl,
            apiKey: mnApiKey,
          },
        ];

        // If user configured a custom/different endpoint, add it as 3rd candidate
        const configuredUrl = gptImageConfig?.baseUrl?.trim();
        if (configuredUrl && !configuredUrl.includes("openlux.ai") && !configuredUrl.includes("mnapi.com")) {
          const configuredKey =
            (gptImageConfig?.apiKey && gptImageConfig.apiKey.trim()) ||
            endpointKeys[configuredUrl] ||
            "";
          if (configuredKey) {
            candidates.push({
              name: configuredUrl.includes("openai.com") ? "OpenAI Gốc" : "Custom Endpoint",
              baseUrl: configuredUrl,
              apiKey: configuredKey,
            });
          }
        }

        let generatedImageUrl: string | null = null;
        let successfulCandidate: ProviderCandidate | null = null;
        let successfulEditUrl = "";
        const candidateErrors: string[] = [];

        let pngBuffer: Buffer | null = null;
        const productBlobs: Array<{ filename: string; blob: Blob; refIndex: number; size: number }> = [];

        const rawBuffer = Buffer.from(baseOriginal, "base64");
        // Convert input image buffer to an RGBA PNG buffer using Sharp
        try {
          pngBuffer = await sharp(rawBuffer)
            .resize(1024, 1024, { fit: "inside", withoutEnlargement: false })
            .ensureAlpha()
            .png({ compressionLevel: 8 })
            .toBuffer();
        } catch (sharpErr) {
          console.warn("sharp resize warning, using raw buffer:", sharpErr);
          pngBuffer = rawBuffer;
        }

        // Prepare all product reference buffers so they are sent as active visual references
        if (enableOutfit && normalizedProductRefs.length > 0) {
          for (const prod of normalizedProductRefs) {
            const rawProdBuf = Buffer.from(prod.data, "base64");
            let prodPng: Buffer;
            try {
              prodPng = await sharp(rawProdBuf)
                .resize(1024, 1024, { fit: "inside", withoutEnlargement: false })
                .ensureAlpha()
                .png({ compressionLevel: 8 })
                .toBuffer();
            } catch {
              prodPng = rawProdBuf;
            }
            productBlobs.push({
              filename: `image_${prod.refIndex}_product_reference.png`,
              blob: new Blob([new Uint8Array(prodPng)], { type: "image/png" }),
              refIndex: prod.refIndex,
              size: prodPng.length,
            });
          }
        }

        const mainImageBuffer = pngBuffer || rawBuffer;

        // Iterate through candidates (Primary -> MNAPI Fallback)
        for (let i = 0; i < candidates.length; i++) {
          const candidate = candidates[i];
          const { editUrl, baseUrl: targetBaseUrl } = normalizeEditsEndpoint(candidate.baseUrl);
          const candidateApiKey = candidate.apiKey.trim();

          if (!candidateApiKey) {
            console.warn(`[FAILOVER] Bỏ qua ${candidate.name} vì chưa có API Key.`);
            continue;
          }

          console.log(`\n=======================================================`);
          console.log(`🚀 [BƯỚC ${i + 1}/${candidates.length}]: TẠO ẢNH QUA ${candidate.name.toUpperCase()}`);
          console.log(`Endpoint: ${editUrl}`);
          console.log(`Model: ${gptModel} | Size: ${gptSize} | Quality: ${gptQuality}`);
          console.log(`=======================================================\n`);

          let lastError = "";

          try {
            const formData = new FormData();
            formData.append("image", new Blob([new Uint8Array(mainImageBuffer)], { type: "image/png" }), "image_1_base.png");
            for (const p of productBlobs) {
              formData.append("image", p.blob, p.filename);
            }
            formData.append("prompt", effectiveGptPrompt);
            if (gptModel) formData.append("model", gptModel);
            formData.append("size", gptSize);
            if (gptQuality) formData.append("quality", gptQuality);
            formData.append("response_format", "b64_json");

            let editRes = await fetch(editUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${candidateApiKey}`,
              },
              body: formData,
            });

            // Fallback 1: Proxy only accepts single file
            if (!editRes.ok) {
              const errClone = await editRes.clone().json().catch(() => ({}));
              const errMsg = (errClone?.error?.message || "").toLowerCase();
              if (
                errMsg.includes("only 1") ||
                errMsg.includes("too many") ||
                errMsg.includes("single file") ||
                errMsg.includes("single image")
              ) {
                console.warn(`[${candidate.name}] Proxy endpoint only accepts single file, retrying with single image + vision prompt...`);
                const singleFormData = new FormData();
                singleFormData.append("image", new Blob([new Uint8Array(mainImageBuffer)], { type: "image/png" }), "image.png");
                singleFormData.append("prompt", effectiveGptPrompt);
                if (gptModel) singleFormData.append("model", gptModel);
                singleFormData.append("size", gptSize);
                singleFormData.append("response_format", "b64_json");
                editRes = await fetch(editUrl, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${candidateApiKey}`,
                  },
                  body: singleFormData,
                });
              }
            }

            // Fallback 2: Size rejected
            if (!editRes.ok) {
              const errClone = await editRes.clone().json().catch(() => ({}));
              const errMsg = (errClone?.error?.message || "").toLowerCase();
              if (errMsg.includes("size") && gptSize !== "1024x1024") {
                console.warn(`[${candidate.name}] Edit endpoint rejected non-square size, retrying with 1024x1024...`);
                formData.set("size", "1024x1024");
                editRes = await fetch(editUrl, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${candidateApiKey}`,
                  },
                  body: formData,
                });
              }
            }

            // Fallback 3: Inpainting mask required
            if (!editRes.ok) {
              const errClone = await editRes.clone().json().catch(() => ({}));
              const errMsg = (errClone?.error?.message || "").toLowerCase();
              if (errMsg.includes("mask") || errMsg.includes("transparent")) {
                console.warn(`[${candidate.name}] Proxy requires mask, generating transparent mask...`);
                try {
                  const maskBuffer = await sharp({
                    create: {
                      width: 1024,
                      height: 1024,
                      channels: 4,
                      background: { r: 0, g: 0, b: 0, alpha: 0 },
                    },
                  }).png().toBuffer();

                  const retryFormData = new FormData();
                  retryFormData.append("image", new Blob([new Uint8Array(mainImageBuffer)], { type: "image/png" }), "image_1_base.png");
                  for (const p of productBlobs) {
                    retryFormData.append("image", p.blob, p.filename);
                  }
                  retryFormData.append("mask", new Blob([new Uint8Array(maskBuffer)], { type: "image/png" }), "mask.png");
                  retryFormData.append("prompt", effectiveGptPrompt);
                  if (gptModel) retryFormData.append("model", gptModel);
                  retryFormData.append("size", gptSize);
                  retryFormData.append("response_format", "b64_json");

                  editRes = await fetch(editUrl, {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${candidateApiKey}`,
                    },
                    body: retryFormData,
                  });
                } catch (maskErr) {
                  console.warn("Could not generate mask buffer:", maskErr);
                }
              }
            }

            if (editRes.ok) {
              const editData = await editRes.json();
              if (editData.data && editData.data[0]) {
                if (editData.data[0].b64_json) {
                  generatedImageUrl = `data:image/png;base64,${editData.data[0].b64_json}`;
                } else if (editData.data[0].url) {
                  generatedImageUrl = editData.data[0].url;
                }
              }
            } else {
              const errObj = await editRes.json().catch(() => ({}));
              lastError = errObj?.error?.message || `HTTP ${editRes.status}`;
            }
          } catch (e: any) {
            lastError = e?.message || String(e);
          }

          // Fallback to /v1/images/generations on the same candidate if edit failed
          if (!generatedImageUrl) {
            const candidateModel = gptModel || "gpt-image-2";
            const fallbackPayload = {
              model: candidateModel,
              prompt: promptInstructions,
              size: gptSize,
              quality: candidateModel === "dall-e-3" ? gptQuality || "standard" : undefined,
              response_format: "b64_json",
            };

            try {
              const genRes = await fetch(`${targetBaseUrl}/images/generations`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${candidateApiKey}`,
                },
                body: JSON.stringify(fallbackPayload),
              });

              if (genRes.ok) {
                const genData = await genRes.json();
                if (genData.data && genData.data[0]) {
                  if (genData.data[0].b64_json) {
                    generatedImageUrl = `data:image/png;base64,${genData.data[0].b64_json}`;
                  } else if (genData.data[0].url) {
                    generatedImageUrl = genData.data[0].url;
                  }
                }
              } else {
                const genErrObj = await genRes.json().catch(() => ({}));
                lastError = genErrObj?.error?.message || lastError;
              }
            } catch (genErr: any) {
              console.warn("Generations fallback error:", genErr);
            }
          }

          if (generatedImageUrl) {
            console.log(`\n✅ [TẠO ẢNH THÀNH CÔNG] Đã tạo thành công qua ${candidate.name} (${editUrl})\n`);
            successfulCandidate = candidate;
            successfulEditUrl = editUrl;
            break; // Success! Stop failover loop
          } else {
            console.warn(`\n⚠️ [${candidate.name} THẤT BẠI]: ${lastError}`);
            candidateErrors.push(`${candidate.name}: ${lastError}`);
            if (i < candidates.length - 1) {
              console.log(`🔄 [TỰ ĐỘNG CHUYỂN TIẾP] Đang tự động thử lại với ${candidates[i + 1].name} (${candidates[i + 1].baseUrl})...\n`);
            }
          }
        }

        if (!generatedImageUrl) {
          const combinedError = candidateErrors.join(" | ") || "Không nhận được hình ảnh từ các dịch vụ API. Vui lòng kiểm tra lại API Key hoặc hạn ngạch.";
          return res.status(400).json({
            error: `Lỗi tạo ảnh sau khi thử tất cả nhà cung cấp: ${combinedError}`,
            needsApiKey: combinedError.toLowerCase().includes("token") || combinedError.toLowerCase().includes("api key") || combinedError.toLowerCase().includes("unauthorized"),
          });
        }

        // If returned image is a remote URL, convert it to base64 for canvas/zip without CORS
        if (generatedImageUrl.startsWith("http")) {
          try {
            const imgFetch = await fetch(generatedImageUrl);
            if (imgFetch.ok) {
              const imgBuffer = await imgFetch.arrayBuffer();
              const b64 = Buffer.from(imgBuffer).toString("base64");
              const cType = imgFetch.headers.get("content-type") || "image/png";
              generatedImageUrl = `data:${cType};base64,${b64}`;
            }
          } catch (fetchErr) {
            console.warn("Could not convert URL to data URL, using raw URL:", fetchErr);
          }
        }

        // Ensure strict 9:16 aspect ratio if requested
        generatedImageUrl = await ensureAspectRatio(generatedImageUrl, aspectRatio);

        const loggedBody = {
          provider: "gpt-image-2",
          endpoint: successfulEditUrl || openLuxUrl,
          providerUsed: successfulCandidate?.name || "OpenLux AI",
          method: "POST",
          headers: {
            Authorization: "Bearer sk-***",
            "Content-Type": "multipart/form-data",
          },
          formData: {
            model: gptModel,
            size: gptSize,
            quality: gptQuality,
            response_format: "b64_json",
            input_images: [
              {
                role: "Image 1 (Ảnh gốc - Bố cục, bối cảnh, tư thế)",
                filename: "image_1_base.png",
                size: `${Math.round((pngBuffer?.length || 0) / 1024)} KB`,
                dimensions: "1024x1024 RGBA PNG",
              },
              ...productBlobs.map((p) => ({
                role: `Image ${p.refIndex} (Ảnh sản phẩm/trang phục tham chiếu cần thay thế)`,
                filename: p.filename,
                size: `${Math.round(p.size / 1024)} KB`,
                dimensions: "1024x1024 RGBA PNG",
              })),
            ],
            total_reference_images: 1 + productBlobs.length,
            prompt: effectiveGptPrompt,
          },
          timestamp: new Date().toISOString(),
        };

        return res.json({
          success: true,
          imageUrl: generatedImageUrl,
          promptUsed: effectiveGptPrompt,
          provider: "gpt-image-2",
          modelUsed: gptModel,
          loggedBody,
        });
      }

      // --- BRANCH B: GOOGLE GEMINI (Default) ---
      // Support custom key from header or body
      const headerKey = req.headers["x-gemini-api-key"] as string | undefined;
      const effectiveKey = (apiKey && apiKey.trim()) || (headerKey && headerKey.trim()) || undefined;
      const ai = getGeminiClient(effectiveKey);

      if (!ai) {
        return res.status(400).json({
          error: "Chưa cấu hình API Key. Vui lòng nhập Khóa API tạo ảnh trong mục Cấu hình API hoặc thiết lập GEMINI_API_KEY trong Settings.",
          needsApiKey: true,
          provider: "gemini",
        });
      }

      // Run vision inspection to analyze Image 1 (base) and Image 2..N (product references)
      const visionSummary = await inspectReplacementPair({
        ai,
        baseOriginal,
        originalMimeType,
        productRefs: normalizedProductRefs,
        outfitPrompt,
        characterPrompt,
        enableCharacter,
      });

      // Build structured prompt matching user specification
      const isCharChange = Boolean(enableCharacter && characterPrompt && characterPrompt.trim());
      const isBgChange = Boolean(backgroundPrompt && backgroundPrompt.trim());

      const promptParts: string[] = [];
      if (isCharChange) {
        promptParts.push(`thay nhân vật thành ${characterPrompt.trim()}`);
      }
      if (isBgChange) {
        promptParts.push(`thay bối cảnh ${backgroundPrompt.trim()}`);
      }
      if (enableOutfit) {
        const targetLabel = (productName && productName.trim()) ? `sản phẩm "${productName.trim()}"` : 'sản phẩm';
        if (normalizedProductRefs.length > 1) {
          const refList = normalizedProductRefs.map((p) => `image${p.refIndex}`).join(', ');
          promptParts.push(`thay ${targetLabel} ở hình ${refList} sang hình image1 (xóa bỏ sản phẩm cũ ở image1 và thay thế chính xác bằng sản phẩm mới từ ${refList})`);
        } else {
          promptParts.push(`thay ${targetLabel} ở hình image2 sang hình image1 (xóa bỏ sản phẩm cũ ở image1 và thay thế chính xác bằng sản phẩm mới từ image2)`);
        }
        if (outfitPrompt && outfitPrompt.trim() && !outfitPrompt.toLowerCase().includes('thay sản phẩm ở hình image2') && !outfitPrompt.toLowerCase().includes('thay sản phẩm ở hình ref2')) {
          promptParts.push(outfitPrompt.trim());
        }
      }
      if (removeSubtitles) {
        promptParts.push('xóa phụ đề subtext trong hình');
      }
      if (!isCharChange && !isBgChange) {
        promptParts.push('giữ nguyên bố cục, ánh sáng, phông nền và người mẫu (nếu có)');
      } else if (!isBgChange) {
        promptParts.push('giữ nguyên bố cục, ánh sáng và phông nền');
      } else if (!isCharChange) {
        promptParts.push('giữ nguyên người mẫu và tư thế (nếu có)');
      }

      // Tỉ lệ khung hình ở cuối prompt (mặc định 9:16)
      promptParts.push(`tỉ lệ khung hình ${aspectRatio || '9:16'}`);

      const promptInstructions = promptParts.join(', ');

      // Prepare parts for multimodal content with explicit positional reference labeling
      const parts: Array<{
        inlineData?: { mimeType: string; data: string };
        text?: string;
      }> = [
          {
            text: `[IMAGE 1: GROUND-TRUTH BASE PHOTOGRAPH]
The following image is Image 1. Retain the scene composition, environment lighting, camera perspective, and all subjects/people (if present) from this image.${backgroundPrompt && backgroundPrompt.trim() ? " ONLY replace the background environment with the requested new scenery, keeping subject positions locked." : " Retain the room environment and background lighting from this image."}`,
          },
          {
            inlineData: {
              mimeType: originalMimeType,
              data: baseOriginal,
            },
          },
        ];

      // Push all product reference images (ref2, ref3, ...) into parts with explicit replacement directives
      if (enableOutfit && normalizedProductRefs.length > 0) {
        for (const prod of normalizedProductRefs) {
          parts.push({
            text: `[IMAGE ${prod.refIndex}: TARGET PRODUCT REFERENCE - ${prod.name}]
CRITICAL TASK: Locate the corresponding product, item, prop, or worn garment in Image 1, ERASE it completely, and replace it with the exact product in this reference image (Image ${prod.refIndex}). Replicate 100% of its visual details, shapes, colors, prints, logos, typography, and material textures.`,
          });
          parts.push({
            inlineData: {
              mimeType: prod.mimeType,
              data: prod.data,
            },
          });
        }
      }

      const effectiveGeminiPrompt = activeDirectPrompt || promptInstructions;

      parts.push({
        text: effectiveGeminiPrompt,
      });

      // Valid aspect ratio check (defaults to 9:16)
      const validAspectRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
      const chosenAspect = validAspectRatios.includes(aspectRatio)
        ? aspectRatio
        : "9:16";

      // Call Gemini Image model for editing
      const targetModel = selectedModel || "gemini-3.1-flash-image";

      console.log("\n=======================================================");
      console.log("🚀 [BODY YÊU CẦU TẠO ẢNH: GOOGLE GEMINI SDK]");
      console.log("Model đích:", targetModel);
      console.log("Cấu hình ảnh (imageConfig):", JSON.stringify({
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: chosenAspect,
          imageSize: "1K",
        },
      }, null, 2));
      console.log("Số lượng thành phần (parts count):", parts.length);
      console.log("Chi tiết các phần parts gửi đi:", parts.map((p, idx) => {
        if (p.inlineData) {
          return `Phần ${idx + 1} [Ảnh]: ${p.inlineData.mimeType} (~${Math.round(p.inlineData.data.length * 0.75 / 1024)} KB)`;
        }
        return `Phần ${idx + 1} [Prompt Văn Bản]: ${p.text?.length || 0} ký tự`;
      }));
      console.log("--- NỘI DUNG PROMPT HOÀN CHỈNH GỬI SANG GEMINI ---");
      console.log(effectiveGeminiPrompt);
      console.log("-------------------------------------------------");
      console.log("=======================================================\n");

      let response;
      let lastGeminiError = "";
      try {
        response = await ai.models.generateContent({
          model: targetModel,
          contents: {
            parts: parts as any,
          },
          config: {
            responseModalities: [Modality.IMAGE],
            imageConfig: {
              aspectRatio: chosenAspect as any,
              imageSize: "1K",
            },
          },
        });
      } catch (firstErr: any) {
        lastGeminiError = firstErr?.message || String(firstErr);
        console.warn(
          `${targetModel} failed (${lastGeminiError}), attempting fallback to gemini-2.5-flash-image`
        );
        try {
          // Fallback model 1
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: {
              parts: parts as any,
            },
            config: {
              responseModalities: [Modality.IMAGE],
              imageConfig: {
                aspectRatio: chosenAspect as any,
              },
            },
          });
        } catch (secondErr: any) {
          lastGeminiError = secondErr?.message || String(secondErr);
          console.warn(
            `gemini-2.5-flash-image failed (${lastGeminiError}), attempting fallback to gemini-3.1-flash-lite-image`
          );
          try {
            // Fallback model 2
            response = await ai.models.generateContent({
              model: "gemini-3.1-flash-lite-image",
              contents: {
                parts: parts as any,
              },
              config: {
                responseModalities: [Modality.IMAGE],
              },
            });
          } catch (thirdErr: any) {
            lastGeminiError = thirdErr?.message || String(thirdErr);
            console.error("All Gemini image generation attempts failed:", lastGeminiError);
          }
        }
      }

      // Extract generated image
      let resultBase64: string | null = null;
      let resultMimeType = "image/png";

      if (response && response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            resultBase64 = part.inlineData.data;
            resultMimeType = part.inlineData.mimeType || "image/png";
            break;
          }
        }
      }

      if (!resultBase64) {
        // Look for text in case the model responded with explanation or rejection
        let returnedText = "";
        if (response && response.candidates && response.candidates[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.text) returnedText += part.text + " ";
          }
        }
        const finalError =
          lastGeminiError ||
          returnedText.trim() ||
          "Không nhận được hình ảnh tạo từ Gemini AI. Vui lòng kiểm tra lại quyền hạn mức của API Key hoặc ảnh tải lên.";
        return res.status(400).json({
          error: finalError,
          needsApiKey: lastGeminiError.includes("API_KEY") || lastGeminiError.includes("401") || lastGeminiError.includes("403"),
        });
      }

      const formattedImageUrl = await ensureAspectRatio(
        `data:${resultMimeType};base64,${resultBase64}`,
        aspectRatio
      );

      const loggedBody = {
        provider: "gemini",
        model: targetModel,
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: chosenAspect,
            imageSize: "1K",
          },
        },
        partsSummary: {
          totalParts: parts.length,
          baseImage: `${originalMimeType} (~${Math.round(baseOriginal.length * 0.75 / 1024)} KB)`,
          productReferenceCount: normalizedProductRefs.length,
          input_images: [
            {
              role: "Image 1 (Ảnh gốc - Bố cục, bối cảnh, tư thế)",
              mimeType: originalMimeType,
              approxSize: `~${Math.round((baseOriginal.length * 0.75) / 1024)} KB`,
            },
            ...normalizedProductRefs.map((p) => ({
              role: `Image ${p.refIndex} (Ảnh sản phẩm/trang phục tham chiếu cần thay thế)`,
              name: p.name,
              mimeType: p.mimeType,
              approxSize: `~${Math.round((p.data.length * 0.75) / 1024)} KB`,
            })),
          ],
          promptCharacters: effectiveGeminiPrompt.length,
        },
        prompt: effectiveGeminiPrompt,
        timestamp: new Date().toISOString(),
      };

      res.json({
        success: true,
        imageUrl: formattedImageUrl,
        promptUsed: effectiveGeminiPrompt,
        provider: "gemini",
        modelUsed: targetModel,
        loggedBody,
      });
    } catch (error: any) {
      console.error("Lỗi khi tạo ảnh qua Gemini:", error);
      res.status(500).json({
        error:
          error?.message ||
          "Đã xảy ra lỗi trong quá trình xử lý hình ảnh với Gemini AI. Vui lòng kiểm tra lại API Key.",
      });
    }
  });

  // Proxy download endpoint to safely stream media files and handle native browser downloads
  app.get("/api/proxy/download", async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      let rawFilename = (req.query.filename as string) || "video.mp4";

      // Ensure proper extension
      if (!rawFilename.includes(".")) {
        rawFilename += ".mp4";
      }

      const cleanFilename = encodeURIComponent(rawFilename);

      if (!rawUrl) {
        return res.status(400).json({ error: "Thiếu tham số URL tệp tải về" });
      }

      // Try multiple URL formats for cloud CDNs (Tencent COS / AWS S3)
      const urlsToTry = [
        rawUrl,
        rawUrl.includes(" ") ? encodeURI(rawUrl) : null,
        rawUrl.includes(" ") ? rawUrl.replace(/ /g, "%20") : null,
      ].filter(Boolean) as string[];

      let response: Response | null = null;
      for (const targetUrl of urlsToTry) {
        try {
          const r = await fetch(targetUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              Accept: "*/*",
            },
          });
          if (r.ok) {
            response = r;
            break;
          }
        } catch (_) { }
      }

      if (!response || !response.ok) {
        console.error(`[Proxy Download] Không thể tải video từ URL: ${rawUrl.slice(0, 80)}...`);
        return res.status(404).json({ error: "Không thể tải tệp từ nguồn từ xa" });
      }

      const contentType =
        response.headers.get("content-type") ||
        (rawFilename.endsWith(".mp4")
          ? "video/mp4"
          : rawFilename.endsWith(".webm")
            ? "video/webm"
            : rawFilename.endsWith(".png")
              ? "image/png"
              : "video/mp4");

      const contentLength = response.headers.get("content-length");

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${rawFilename}"; filename*=UTF-8''${cleanFilename}`
      );
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Accept-Ranges", "bytes");

      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return res.end(buffer);
    } catch (error: any) {
      console.error("[Proxy Download] Lỗi exception:", error);
      return res.status(500).json({ error: error?.message || "Lỗi khi tải tệp qua proxy download" });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server đang chạy trên http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Không thể khởi động server:", err);
});
