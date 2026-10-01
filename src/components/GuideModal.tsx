import React from 'react';
import { X, Video, Shirt, User, Subtitles, Sparkles, Film, Lightbulb, CheckCircle2 } from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      id="guide-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="guide-modal-content"
        className="bg-white rounded-2xl max-w-2xl w-full border border-stone-200 shadow-2xl p-6 sm:p-7 relative my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 flex items-center justify-center transition-colors"
          title="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-md shadow-indigo-100 ring-1 ring-black/5">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
              Hướng dẫn Quy trình CLONE VIDEO V1.0
            </h3>
            <p className="text-xs sm:text-sm text-stone-500">
              Quy trình 5 bước tối ưu từ Video mẫu đến Bộ ảnh & Video mới chất lượng cao
            </p>
          </div>
        </div>

        {/* Steps List */}
        <div className="space-y-4 my-5 text-xs sm:text-sm text-stone-700 max-h-[62vh] overflow-y-auto pr-1">
          {/* Step 1 */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-stone-50/90 border border-stone-200 hover:border-indigo-300 transition-colors">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                1
              </div>
              <h4 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                <Video className="w-4 h-4 text-indigo-600" />
                Trích xuất Frame & Phân tích Prompt từ Video mẫu
              </h4>
            </div>
            <ul className="space-y-1.5 ml-8 text-xs text-stone-600 list-disc list-outside">
              <li>
                <b>Tải lên video mẫu:</b> Hỗ trợ tệp <code>.mp4</code>, <code>.mov</code> hoặc kéo thả danh sách ảnh gốc trực tiếp từ máy tính.
              </li>
              <li>
                <b>Cắt khung hình tự động:</b> AI quét và trích xuất các khung hình sắc nét theo từng phân cảnh chuẩn.
              </li>
              <li>
                <b>Phân tích chuyển động AI:</b> Động cơ <i>Gemini Flash</i> tự động quan sát video và tạo câu lệnh Prompt hành động tiếng Việt cho từng phân cảnh.
              </li>
            </ul>
          </div>

          {/* Step 2 */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-stone-50/90 border border-stone-200 hover:border-violet-300 transition-colors">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-6 h-6 rounded-lg bg-violet-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                2
              </div>
              <h4 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                <User className="w-4 h-4 text-violet-600" />
                Nhập Nhân vật mới & Thiết lập Dáng điệu
              </h4>
            </div>
            <ul className="space-y-1.5 ml-8 text-xs text-stone-600 list-disc list-outside">
              <li>
                <b>Mô tả nhân vật:</b> Nhập độ tuổi, giới tính, nét mặt, kiểu tóc và phong cách (ví dụ: <i>Nữ người mẫu Việt Nam 24 tuổi, tóc dài đen, trang điểm nhẹ nhàng</i>).
              </li>
              <li>
                <b>Giữ nguyên dáng điệu gốc:</b> Bật tùy chọn này để nhân vật mới có dáng đứng, cử chỉ tay và góc nhìn khớp hoàn toàn với video ban đầu.
              </li>
            </ul>
          </div>

          {/* Step 3 */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-stone-50/90 border border-stone-200 hover:border-emerald-300 transition-colors">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                3
              </div>
              <h4 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                <Shirt className="w-4 h-4 text-emerald-600" />
                Tải lên mẫu Trang phục / Sản phẩm cần đổi
              </h4>
            </div>
            <ul className="space-y-1.5 ml-8 text-xs text-stone-600 list-disc list-outside">
              <li>
                <b>Tải ảnh mẫu thực tế:</b> Đưa ảnh chụp bộ trang phục (váy, áo, vest...), phụ kiện hoặc sản phẩm bạn muốn quảng cáo vào hệ thống.
              </li>
              <li>
                <b>Ghép đồ thông minh:</b> AI tự động phân tích chất liệu vải, màu sắc, hoa văn và mặc vừa vặn lên nhân vật mới trong từng khung hình.
              </li>
            </ul>
          </div>

          {/* Step 4 */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-stone-50/90 border border-stone-200 hover:border-amber-300 transition-colors">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-6 h-6 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                4
              </div>
              <h4 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                <Subtitles className="w-4 h-4 text-amber-600" />
                Xóa sạch Phụ đề cũ & Tạo ảnh Hàng loạt (4K)
              </h4>
            </div>
            <ul className="space-y-1.5 ml-8 text-xs text-stone-600 list-disc list-outside">
              <li>
                <b>Xóa phụ đề & Watermark:</b> Bật tính năng Inpaint để AI tự động xóa chữ, sub vietsub và phục hồi nền gốc mượt mà.
              </li>
              <li>
                <b>Động cơ tạo ảnh:</b> Lựa chọn giữa <b>GPT-Image-2</b> hoặc <b>Gemini</b> để tạo ảnh độ nét cao chuẩn 4K.
              </li>
              <li>
                <b>Xử lý đa luồng:</b> Bấm <b>"Xử lý tất cả"</b> để render hàng loạt ảnh tự động nhanh chóng hoặc chỉnh sửa riêng từng ảnh.
              </li>
            </ul>
          </div>

          {/* Step 5 */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-blue-50/80 border border-blue-200 hover:border-blue-400 transition-colors">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                5
              </div>
              <h4 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                <Film className="w-4 h-4 text-blue-600" />
                Tạo Video Chuyển động (Kling AI) & Xuất file ZIP
              </h4>
            </div>
            <ul className="space-y-1.5 ml-8 text-xs text-stone-600 list-disc list-outside">
              <li>
                <b>Tạo Video AI:</b> Bấm nút tạo video ở từng phân cảnh để Kling AI biến ảnh mới thành video chuyển động sinh động đúng theo prompt.
              </li>
              <li>
                <b>So sánh Trước / Sau:</b> Kéo thanh trượt trực tiếp trên ảnh để đối chiếu kết quả trước khi tải.
              </li>
              <li>
                <b>Tải toàn bộ file .ZIP:</b> Tải về trọn bộ ảnh kết quả chất lượng cao và danh sách video chỉ với 1 cú click.
              </li>
            </ul>
          </div>

          {/* Tip Box */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-900">
            <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[12px] leading-relaxed">
              <b>Mẹo nhanh:</b> Nhấn nút <b>"Áp dụng cấu hình này cho tất cả"</b> ở thanh công cụ để đồng bộ nhân vật và trang phục cho toàn bộ danh sách phân cảnh chỉ trong 1 giây!
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-5 pt-3 border-t border-stone-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-xs sm:text-sm font-bold text-white shadow-sm transition-all cursor-pointer text-center"
          >
            Đã hiểu, bắt đầu sử dụng
          </button>
        </div>
      </div>
    </div>
  );
};


