/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: TỰ ĐỘNG LƯU PROMPT & HÌNH ẢNH VÀO GOOGLE DRIVE + GOOGLE SHEETS
 * ==============================================================================
 * 
 * HƯỚNG DẪN CÀI ĐẶT NHANH (100% MIỄN PHÍ - KHÔNG CẦN THẺ):
 * 1. Mở Google Sheets của bạn (hoặc tạo 1 Google Sheet mới).
 * 2. Vào menu: Tiện ích mở rộng (Extensions) -> Apps Script.
 * 3. Xóa toàn bộ nội dung cũ trong file Code.gs và dán toàn bộ đoạn mã này vào.
 * 4. Thay ID thư mục Google Drive của bạn vào biến DRIVE_FOLDER_ID bên dưới.
 *    (Nếu để trống "", ảnh sẽ tự động lưu vào thư mục gốc My Drive của bạn).
 * 5. Bấm icon Lưu (Save / Ctrl+S).
 * 6. Bấm nút "Triển khai" (Deploy) ở góc trên bên phải -> "Tùy chọn triển khai mới" (New deployment).
 * 7. Chọn loại: "Ứng dụng web" (Web app).
 *    - Mô tả: AI Media Storage API
 *    - Thực thi dưới dạng (Execute as): "Tôi" (Me)
 *    - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone) -> RẤT QUAN TRỌNG
 * 8. Bấm "Triển khai" (Deploy) -> Ủy quyền truy cập tài khoản Google của bạn.
 * 9. Copy "URL của ứng dụng web" (Web App URL) và dán vào Cài đặt của Web App!
 */

// ĐIỀN ID THƯ MỤC GOOGLE DRIVE CỦA BẠN VÀO ĐÂY (Đã điền sẵn ID thư mục của bạn)
const DRIVE_FOLDER_ID = "1ngQD2c3o4d8-jDw4eadYBZOfD239H-y0";

// ==============================================================================
// XỬ LÝ REQUEST HTTP POST TỪ WEB APP
// ==============================================================================
function doPost(e) {
  try {
    let data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    const action = data.action || "save_generation";

    let result = {};

    switch (action) {
      case "ping":
      case "test":
        result = handlePing();
        break;

      case "upload_file":
      case "upload_media":
        result = handleUploadFile(data);
        break;

      case "save_generation":
        result = handleSaveGeneration(data);
        break;

      case "get_history":
        result = handleGetHistory(data);
        break;

      case "save_project":
        result = handleSaveProject(data);
        break;

      case "get_projects":
        result = handleGetProjects(data);
        break;

      case "delete_project":
        result = handleDeleteProject(data);
        break;

      default:
        result = { success: false, error: "Hành động (action) không hợp lệ: " + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// XỬ LÝ REQUEST HTTP GET (Dùng để test trên trình duyệt)
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Google Apps Script AI Storage API đang hoạt động bình thường!",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// ==============================================================================
// 1. KIỂM TRA KẾT NỐI (PING)
// ==============================================================================
function handlePing() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let folderName = "Thư mục gốc (My Drive)";

  if (DRIVE_FOLDER_ID && DRIVE_FOLDER_ID.trim() !== "") {
    try {
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID.trim());
      folderName = folder.getName();
    } catch (e) {
      folderName = "Không tìm thấy thư mục (Sẽ lưu vào thư mục gốc)";
    }
  }

  return {
    success: true,
    message: "Kết nối Google Drive & Sheets thành công!",
    spreadsheetName: ss.getName(),
    folderName: folderName,
    serverTime: Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyyy-MM-dd HH:mm:ss")
  };
}

// ==============================================================================
// 2. LƯU LƯỢT TẠO ẢNH / VIDEO (PROMPT + ẢNH DRIVE + METADATA)
// ==============================================================================
function handleSaveGeneration(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Generations");

  // Tự động tạo Sheet "Generations" nếu chưa có
  if (!sheet) {
    sheet = ss.insertSheet("Generations");
  }

  // Tự động tạo hàng Tiêu đề nếu là Sheet mới
  if (sheet.getLastRow() === 0) {
    const headers = [
      "ID",
      "Thời Gian",
      "Loại Tác Vụ",
      "Trạng Thái",
      "Prompt",
      "Negative Prompt / Camera",
      "Model AI",
      "Link Ảnh Gốc (Drive)",
      "Link Kết Quả (Drive)",
      "Thumbnail (Drive)",
      "Thông Số Chi Tiết (JSON)"
    ];
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#4F46E5");
    headerRange.setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
  }

  // Lấy thư mục Google Drive
  const folder = getTargetFolder();

  const recordId = data.id || ("gen_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7));
  const timestamp = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyyy-MM-dd HH:mm:ss");

  let inputDriveUrl = data.input_media_url || data.inputImageUrl || "";
  let outputDriveUrl = data.output_media_url || data.outputImageUrl || "";
  let thumbnailDriveUrl = data.thumbnail_url || "";

  // Lưu ảnh Input nếu gửi base64
  if (data.input_base64 || data.inputImageBase64 || (typeof inputDriveUrl === "string" && inputDriveUrl.startsWith("data:"))) {
    const base64Str = data.input_base64 || data.inputImageBase64 || inputDriveUrl;
    const uploadedUrl = saveBase64ToDrive(folder, base64Str, "input_" + recordId + ".png");
    if (uploadedUrl) inputDriveUrl = uploadedUrl;
  }

  // Lưu ảnh Output nếu gửi base64
  if (data.output_base64 || data.outputImageBase64 || (typeof outputDriveUrl === "string" && outputDriveUrl.startsWith("data:"))) {
    const base64Str = data.output_base64 || data.outputImageBase64 || outputDriveUrl;
    const uploadedUrl = saveBase64ToDrive(folder, base64Str, "result_" + recordId + ".png");
    if (uploadedUrl) {
      outputDriveUrl = uploadedUrl;
      thumbnailDriveUrl = uploadedUrl;
    }
  }

  const rowData = [
    recordId,
    timestamp,
    data.task_type || data.taskType || "image_swap",
    data.status || "completed",
    data.prompt || "",
    data.negative_prompt || data.camera_prompt || data.negativePrompt || "",
    data.model_name || data.modelName || "",
    inputDriveUrl,
    outputDriveUrl,
    thumbnailDriveUrl,
    JSON.stringify(data.parameters || data.settings || {})
  ];

  sheet.appendRow(rowData);

  return {
    success: true,
    message: "Đã lưu bản ghi và tải ảnh lên Google Drive + Sheets thành công!",
    data: {
      id: recordId,
      timestamp: timestamp,
      input_media_url: inputDriveUrl,
      output_media_url: outputDriveUrl,
      thumbnail_url: thumbnailDriveUrl
    }
  };
}

// ==============================================================================
// 2.1. UPLOAD ẢNH ĐƠN LẺ LÊN GOOGLE DRIVE (SIÊU NHANH, TRẢ VỀ LINK XEM TRỰC TIẾP)
// ==============================================================================
function handleUploadFile(data) {
  const folder = getTargetFolder();
  const base64Str = data.base64 || data.dataUrl || data.image || data.file || data.input_base64;
  const filename = data.filename || ("file_" + Date.now() + ".png");

  if (!base64Str) {
    return { success: false, error: "Thiếu dữ liệu base64" };
  }

  const url = saveBase64ToDrive(folder, base64Str, filename);
  if (url) {
    return {
      success: true,
      url: url,
      directUrl: url,
      filename: filename,
      message: "Đã tải file lên Google Drive thành công!"
    };
  } else {
    return {
      success: false,
      error: "Không thể lưu file vào Google Drive. Vui lòng kiểm tra quyền truy cập thư mục."
    };
  }
}

// ==============================================================================
// 3. LẤY LỊCH SỬ TỪ GOOGLE SHEET (DÙNG CHO BỘ SƯU TẬP / GALLERY)
// ==============================================================================
function handleGetHistory(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Generations");

  if (!sheet || sheet.getLastRow() <= 1) {
    return { success: true, items: [], total: 0 };
  }

  const limit = data.limit ? parseInt(data.limit, 10) : 100;
  const lastRow = sheet.getLastRow();
  const numRows = Math.min(limit, lastRow - 1);
  const startRow = Math.max(2, lastRow - numRows + 1);

  // Đọc dữ liệu từ dòng mới nhất trở về trước
  const range = sheet.getRange(startRow, 1, numRows, 11);
  const values = range.getValues();

  const items = [];
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    let params = {};
    try {
      if (row[10]) params = JSON.parse(row[10]);
    } catch (e) { }

    items.push({
      id: row[0],
      created_at: row[1],
      task_type: row[2],
      status: row[3],
      prompt: row[4],
      negative_prompt: row[5],
      model_name: row[6],
      input_media_url: row[7],
      output_media_url: row[8],
      thumbnail_url: row[9] || row[8],
      parameters: params
    });
  }

  return {
    success: true,
    items: items,
    total: lastRow - 1
  };
}

// ==============================================================================
// 4. LƯU DỰ ÁN / PHIÊN LÀM VIỆC VÀO SHEET "Projects"
// ==============================================================================
function handleSaveProject(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Projects");

  if (!sheet) {
    sheet = ss.insertSheet("Projects");
  }

  if (sheet.getLastRow() === 0) {
    const headers = ["ID", "Tên Dự Án", "Tác Giả", "Mô Tả", "Thời Gian Tạo", "Cập Nhật Lần Cuối", "Dữ Liệu Dự Án (JSON)"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#10B981").setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
  }

  const projectId = data.id || ("proj_" + Date.now());
  const now = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyyy-MM-dd HH:mm:ss");
  const folder = getTargetFolder();

  // 1. Tự động chuyển đổi toàn bộ ảnh base64 trong uploaded_outfits thành link Google Drive
  let processedOutfits = [];
  if (Array.isArray(data.uploaded_outfits)) {
    for (let i = 0; i < data.uploaded_outfits.length; i++) {
      const outfit = data.uploaded_outfits[i];
      if (!outfit) continue;
      const itemCopy = JSON.parse(JSON.stringify(outfit));
      const rawBase64 = itemCopy.dataUrl || itemCopy.previewUrl;
      if (rawBase64 && typeof rawBase64 === "string" && rawBase64.indexOf("data:") === 0) {
        const driveUrl = saveBase64ToDrive(folder, rawBase64, "outfit_" + projectId + "_" + (itemCopy.id || ("ref" + (i + 2))) + ".png");
        if (driveUrl) {
          itemCopy.dataUrl = driveUrl;
          itemCopy.previewUrl = driveUrl;
        }
      }
      processedOutfits.push(itemCopy);
    }
  }

  // 2. Tự động chuyển đổi toàn bộ ảnh base64 trong items thành link Google Drive
  let processedItems = [];
  if (Array.isArray(data.items)) {
    for (let j = 0; j < data.items.length; j++) {
      const it = data.items[j];
      if (!it) continue;
      const itemCopy = JSON.parse(JSON.stringify(it));
      if (itemCopy.dataUrl && typeof itemCopy.dataUrl === "string" && itemCopy.dataUrl.indexOf("data:") === 0) {
        const inputUrl = saveBase64ToDrive(folder, itemCopy.dataUrl, "input_" + projectId + "_" + (itemCopy.id || j) + ".png");
        if (inputUrl) {
          itemCopy.dataUrl = inputUrl;
          itemCopy.previewUrl = inputUrl;
        }
      }
      if (itemCopy.previewUrl && typeof itemCopy.previewUrl === "string" && itemCopy.previewUrl.indexOf("data:") === 0) {
        const prevUrl = saveBase64ToDrive(folder, itemCopy.previewUrl, "input_prev_" + projectId + "_" + (itemCopy.id || j) + ".png");
        if (prevUrl) {
          itemCopy.previewUrl = prevUrl;
          if (!itemCopy.dataUrl || itemCopy.dataUrl.indexOf("data:") === 0) itemCopy.dataUrl = prevUrl;
        }
      }
      if (itemCopy.resultImageUrl && typeof itemCopy.resultImageUrl === "string" && itemCopy.resultImageUrl.indexOf("data:") === 0) {
        const resUrl = saveBase64ToDrive(folder, itemCopy.resultImageUrl, "result_" + projectId + "_" + (itemCopy.id || j) + ".png");
        if (resUrl) itemCopy.resultImageUrl = resUrl;
      }
      if (Array.isArray(itemCopy.resultImageUrls)) {
        for (let v = 0; v < itemCopy.resultImageUrls.length; v++) {
          if (itemCopy.resultImageUrls[v] && typeof itemCopy.resultImageUrls[v] === "string" && itemCopy.resultImageUrls[v].indexOf("data:") === 0) {
            const varUrl = saveBase64ToDrive(folder, itemCopy.resultImageUrls[v], "var_" + projectId + "_" + (itemCopy.id || j) + "_" + v + ".png");
            if (varUrl) itemCopy.resultImageUrls[v] = varUrl;
          }
        }
      }
      if (itemCopy.videoStartImageUrl && typeof itemCopy.videoStartImageUrl === "string" && itemCopy.videoStartImageUrl.indexOf("data:") === 0) {
        const startUrl = saveBase64ToDrive(folder, itemCopy.videoStartImageUrl, "start_" + projectId + "_" + (itemCopy.id || j) + ".png");
        if (startUrl) itemCopy.videoStartImageUrl = startUrl;
      }
      if (itemCopy.videoEndImageUrl && typeof itemCopy.videoEndImageUrl === "string" && itemCopy.videoEndImageUrl.indexOf("data:") === 0) {
        const endUrl = saveBase64ToDrive(folder, itemCopy.videoEndImageUrl, "end_" + projectId + "_" + (itemCopy.id || j) + ".png");
        if (endUrl) itemCopy.videoEndImageUrl = endUrl;
      }
      if (itemCopy.appliedConfig && itemCopy.appliedConfig.outfitImageUrl && typeof itemCopy.appliedConfig.outfitImageUrl === "string" && itemCopy.appliedConfig.outfitImageUrl.indexOf("data:") === 0) {
        const cfgOutfitUrl = saveBase64ToDrive(folder, itemCopy.appliedConfig.outfitImageUrl, "cfg_outfit_" + projectId + "_" + (itemCopy.id || j) + ".png");
        if (cfgOutfitUrl) itemCopy.appliedConfig.outfitImageUrl = cfgOutfitUrl;
      }
      if (itemCopy.appliedConfig && Array.isArray(itemCopy.appliedConfig.productReferences)) {
        for (let r = 0; r < itemCopy.appliedConfig.productReferences.length; r++) {
          const ref = itemCopy.appliedConfig.productReferences[r];
          if (ref && (ref.dataUrl || ref.previewUrl)) {
            const refBase = ref.dataUrl || ref.previewUrl;
            if (typeof refBase === "string" && refBase.indexOf("data:") === 0) {
              const refUrl = saveBase64ToDrive(folder, refBase, "cfg_ref_" + projectId + "_" + (itemCopy.id || j) + "_" + r + ".png");
              if (refUrl) {
                ref.dataUrl = refUrl;
                ref.previewUrl = refUrl;
              }
            }
          }
        }
      }
      processedItems.push(itemCopy);
    }
  }

  // Kiểm tra xem ID đã tồn tại chưa để cập nhật hoặc thêm mới
  const lastRow = sheet.getLastRow();
  let existingRow = -1;

  if (lastRow > 1) {
    const idColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < idColumn.length; i++) {
      if (idColumn[i][0] === projectId) {
        existingRow = i + 2;
        break;
      }
    }
  }

  const projectPayload = JSON.stringify({
    settings: data.settings || {},
    uploaded_outfits: processedOutfits,
    items: processedItems
  });

  if (existingRow > 0) {
    // Đọc dữ liệu cũ để merge nếu một số trường không được gửi kèm
    let existingData = {};
    try {
      const oldPayload = sheet.getRange(existingRow, 7).getValue();
      if (oldPayload && typeof oldPayload === "string") {
        existingData = JSON.parse(oldPayload);
      }
    } catch (e) { }

    const oldSettings = existingData.settings || {};
    const newSettings = data.settings || {};
    const mergedSettings = {};
    for (const k in oldSettings) {
      mergedSettings[k] = oldSettings[k];
    }
    for (const k in newSettings) {
      if (newSettings[k] !== undefined && newSettings[k] !== null) {
        mergedSettings[k] = newSettings[k];
      }
    }
    const mergedOutfits = Array.isArray(data.uploaded_outfits)
      ? processedOutfits
      : (existingData.uploaded_outfits || []);
    const mergedItems = Array.isArray(data.items)
      ? processedItems
      : (existingData.items || []);

    const projectPayload = JSON.stringify({
      settings: mergedSettings,
      uploaded_outfits: mergedOutfits,
      items: mergedItems
    });

    const existingName = sheet.getRange(existingRow, 2).getValue();
    const existingAuthor = sheet.getRange(existingRow, 3).getValue();
    const existingDesc = sheet.getRange(existingRow, 4).getValue();

    const finalName = (data.name && data.name.trim() !== "") ? data.name : (existingName || "Dự án mới");
    const finalAuthor = (data.author_name && data.author_name.trim() !== "") ? data.author_name : (existingAuthor || "Ẩn danh");
    const finalDesc = data.description !== undefined ? data.description : (existingDesc || "");

    sheet.getRange(existingRow, 2).setValue(finalName);
    sheet.getRange(existingRow, 3).setValue(finalAuthor);
    sheet.getRange(existingRow, 4).setValue(finalDesc);
    sheet.getRange(existingRow, 6).setValue(now);
    sheet.getRange(existingRow, 7).setValue(projectPayload);

    return {
      success: true,
      message: "Đã lưu dự án vào Google Sheets & tải toàn bộ ảnh sản phẩm lên Google Drive!",
      projectId: projectId,
      updatedAt: now,
      data: {
        id: projectId,
        name: finalName,
        author_name: finalAuthor,
        description: finalDesc,
        created_at: data.created_at || now,
        updated_at: now,
        settings: mergedSettings,
        uploaded_outfits: mergedOutfits,
        items: mergedItems
      }
    };
  } else {
    // Thêm dòng mới
    const finalName = data.name || "Dự án mới";
    const finalAuthor = data.author_name || "Ẩn danh";
    const finalDesc = data.description || "";

    sheet.appendRow([
      projectId,
      finalName,
      finalAuthor,
      finalDesc,
      data.created_at || now,
      now,
      projectPayload
    ]);

    return {
      success: true,
      message: "Đã lưu dự án vào Google Sheets & tải toàn bộ ảnh sản phẩm lên Google Drive!",
      projectId: projectId,
      updatedAt: now,
      data: {
        id: projectId,
        name: finalName,
        author_name: finalAuthor,
        description: finalDesc,
        created_at: data.created_at || now,
        updated_at: now,
        settings: data.settings || {},
        uploaded_outfits: processedOutfits,
        items: processedItems
      }
    };
  }
}

// ==============================================================================
// 5. LẤY DANH SÁCH DỰ ÁN TỪ SHEET "Projects"
// ==============================================================================
function handleGetProjects(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Projects");

  if (!sheet || sheet.getLastRow() <= 1) {
    return { success: true, projects: [] };
  }

  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const projects = [];

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    let projectData = {};
    try {
      if (row[6]) projectData = JSON.parse(row[6]);
    } catch (e) { }

    projects.push({
      id: row[0],
      name: row[1],
      author_name: row[2],
      description: row[3],
      created_at: row[4],
      updated_at: row[5],
      settings: projectData.settings || {},
      uploaded_outfits: projectData.uploaded_outfits || [],
      items: projectData.items || []
    });
  }

  return {
    success: true,
    projects: projects
  };
}

// ==============================================================================
// 6. XÓA DỰ ÁN & TỰ ĐỘNG XÓA HÌNH ẢNH TRÊN GOOGLE DRIVE
// ==============================================================================
function handleDeleteProject(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const projectId = data.id;
  if (!projectId) {
    return { success: false, error: "Thiếu ID dự án cần xóa" };
  }

  const mediaUrlsToDelete = [];

  // 1. Nếu client truyền kèm danh sách media_urls
  if (Array.isArray(data.media_urls)) {
    data.media_urls.forEach(function (url) {
      if (url) mediaUrlsToDelete.push(url);
    });
  }

  // 2. Tìm dòng dự án trong sheet "Projects" để trích xuất thêm link ảnh và xóa hàng
  const projectSheet = ss.getSheetByName("Projects") || ss.getActiveSheet();
  if (projectSheet && projectSheet.getLastRow() > 1) {
    const lastRow = projectSheet.getLastRow();
    const rows = projectSheet.getRange(2, 1, lastRow - 1, 7).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(projectId).trim()) {
        try {
          const payloadJson = rows[i][6];
          if (payloadJson) {
            const parsed = JSON.parse(payloadJson);
            extractMediaUrls(parsed, mediaUrlsToDelete);
          }
        } catch (e) { }

        // Xóa dòng dự án
        projectSheet.deleteRow(i + 2);
        break;
      }
    }
  }

  // 3. Xóa các dòng lịch sử tạo ảnh thuộc dự án này trong sheet "Generations"
  const genSheet = ss.getSheetByName("Generations");
  if (genSheet && genSheet.getLastRow() > 1) {
    const genLastRow = genSheet.getLastRow();
    const genValues = genSheet.getRange(2, 1, genLastRow - 1, 11).getValues();
    // Xóa từ dưới lên để không bị lệch chỉ mục dòng
    for (let j = genValues.length - 1; j >= 0; j--) {
      const row = genValues[j];
      let belongsToProject = false;
      try {
        if (row[10]) {
          const p = JSON.parse(row[10]);
          if (p.project_id === projectId) belongsToProject = true;
        }
      } catch (e) { }

      if (belongsToProject) {
        if (row[7]) mediaUrlsToDelete.push(row[7]); // input image url
        if (row[8]) mediaUrlsToDelete.push(row[8]); // output image url
        genSheet.deleteRow(j + 2);
      }
    }
  }

  // 4. Xóa toàn bộ file ảnh trên Google Drive
  let deletedCount = 0;
  const uniqueUrls = Array.from(new Set(mediaUrlsToDelete));
  uniqueUrls.forEach(function (url) {
    const fileId = extractDriveFileId(url);
    if (fileId) {
      try {
        const file = DriveApp.getFileById(fileId);
        if (file) {
          file.setTrashed(true); // Chuyển vào thùng rác Drive
          deletedCount++;
        }
      } catch (err) {
        console.warn("Không thể xóa file Drive:", fileId, err);
      }
    }
  });

  return {
    success: true,
    message: "Đã xóa thành công dự án, dữ liệu bảng tính và " + deletedCount + " file ảnh trên Google Drive!"
  };
}

// Hàm trích xuất link ảnh từ cấu trúc dữ liệu dự án
function extractMediaUrls(obj, list) {
  if (!obj) return;
  if (Array.isArray(obj.items)) {
    obj.items.forEach(function (item) {
      if (item.dataUrl) list.push(item.dataUrl);
      if (item.resultImageUrl) list.push(item.resultImageUrl);
      if (Array.isArray(item.resultImageUrls)) {
        item.resultImageUrls.forEach(function (u) { if (u) list.push(u); });
      }
      if (item.videoStartImageUrl) list.push(item.videoStartImageUrl);
      if (item.videoEndImageUrl) list.push(item.videoEndImageUrl);
    });
  }
  if (Array.isArray(obj.uploaded_outfits)) {
    obj.uploaded_outfits.forEach(function (outfit) {
      if (outfit.previewUrl) list.push(outfit.previewUrl);
      if (outfit.dataUrl) list.push(outfit.dataUrl);
    });
  }
}

// Hàm trích xuất File ID từ link Google Drive
function extractDriveFileId(url) {
  if (!url || typeof url !== "string") return null;
  const m1 = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (m1 && m1[1]) return m1[1];
  const m2 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m2 && m2[1]) return m2[1];
  const m3 = url.match(/id=([a-zA-Z0-9_-]+)/);
  if (m3 && m3[1]) return m3[1];
  return null;
}

// ==============================================================================
// HÀM TIỆN ÍCH LƯU FILE VÀO GOOGLE DRIVE & TẠO LINK TRỰC TIẾP
// ==============================================================================
function getTargetFolder() {
  if (DRIVE_FOLDER_ID && DRIVE_FOLDER_ID.trim() !== "") {
    try {
      return DriveApp.getFolderById(DRIVE_FOLDER_ID.trim());
    } catch (e) {
      console.warn("Không tìm thấy folder với ID chỉ định, chuyển sang thư mục gốc:", e);
    }
  }
  return DriveApp.getRootFolder();
}

function saveBase64ToDrive(folder, base64String, fileName) {
  try {
    if (!base64String || typeof base64String !== "string") return null;

    // Nếu đã là link URL rồi thì giữ nguyên
    if (base64String.indexOf("http://") === 0 || base64String.indexOf("https://") === 0) {
      return base64String;
    }

    let cleanBase64 = base64String;
    let contentType = "image/png";

    if (base64String.indexOf("data:") === 0) {
      const commaIndex = base64String.indexOf(",");
      if (commaIndex !== -1) {
        const header = base64String.substring(0, commaIndex);
        cleanBase64 = base64String.substring(commaIndex + 1);
        const match = header.match(/:(.*?);/);
        if (match && match[1]) contentType = match[1];
      }
    }

    // Xóa toàn bộ ký tự rác, khoảng trắng và dòng mới
    cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, "");
    if (!cleanBase64) return null;

    const decoded = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decoded, contentType, fileName);

    let targetFolder = folder;
    if (!targetFolder) {
      targetFolder = getTargetFolder();
    }

    const file = targetFolder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      console.warn("Không thể gán quyền share file:", shareErr);
    }

    const fileId = file.getId();
    return "https://lh3.googleusercontent.com/d/" + fileId;
  } catch (err) {
    console.error("Lỗi khi lưu Base64 vào Google Drive:", err);
    return null;
  }
}
