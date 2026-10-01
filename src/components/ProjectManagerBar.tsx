import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FolderKanban,
  FolderOpen,
  Plus,
  Save,
  CheckCircle2,
  Clock,
  User,
  Users,
  Trash2,
  X,
  Search,
  RefreshCw,
  Sparkles,
  Film,
  Image as ImageIcon,
  AlertCircle,
  FileText,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { ProjectRecord, BatchSettings, OutfitReference, BatchImageItem } from '../types';
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
} from '../utils/supabaseClient';

const LAST_AUTHOR_KEY = 'ai_app_last_author_name';
const LAST_PROJECT_ID_KEY = 'ai_app_active_project_id';

interface ProjectManagerBarProps {
  currentProject: ProjectRecord | null;
  onSelectProject: (project: ProjectRecord) => void;
  onSaveCurrentProject: () => Promise<boolean>;
  isDirty?: boolean;
  isSaving?: boolean;
  isGenerating?: boolean;
  lastSavedAt?: Date | null;
  currentSettings: BatchSettings;
  currentUploadedOutfits: OutfitReference[];
  currentItems: BatchImageItem[];
  showToast: (message: string, type?: 'info' | 'success' | 'warning') => void;
}

export const ProjectManagerBar: React.FC<ProjectManagerBarProps> = ({
  currentProject,
  onSelectProject,
  onSaveCurrentProject,
  isDirty = false,
  isSaving = false,
  isGenerating = false,
  lastSavedAt,
  currentSettings,
  currentUploadedOutfits,
  currentItems,
  showToast,
}) => {
  // Modal states
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isProjectsListModalOpen, setIsProjectsListModalOpen] = useState(false);

  // New project form state
  const [projectNameInput, setProjectNameInput] = useState('');
  const [authorNameInput, setAuthorNameInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [cloneCurrentWorkspace, setCloneCurrentWorkspace] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Projects list state
  const [projectsList, setProjectsList] = useState<ProjectRecord[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  // Fetch projects from Supabase (supports silent background refresh)
  const loadProjects = useCallback(async (silent: boolean = false) => {
    const isSilent = typeof silent === 'boolean' ? silent : false;
    if (!isSilent) setIsLoadingProjects(true);
    try {
      const data = await fetchProjects();
      setProjectsList(data);
    } catch (err: any) {
      console.warn('Lỗi tải danh sách dự án:', err);
    } finally {
      if (!isSilent) setIsLoadingProjects(false);
    }
  }, []);

  // Pre-load projects & authors immediately on page load
  useEffect(() => {
    loadProjects(false);
  }, [loadProjects]);

  // Silently re-fetch and update projects list whenever project is saved / auto-saved
  useEffect(() => {
    if (lastSavedAt) {
      loadProjects(true);
    }
  }, [lastSavedAt, loadProjects]);

  // Open projects list modal instantly without blocking reload
  const handleOpenProjectsList = () => {
    setIsProjectsListModalOpen(true);
    setSelectedAuthorFilter(null);
    // Silent background sync if already pre-loaded
    loadProjects(projectsList.length > 0);
  };

  // Create new project handler
  const handleCreateNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) {
      showToast('Đang trong quá trình tạo ảnh/video AI dở! Vui lòng đợi hoàn tất trước khi tạo dự án mới.', 'warning');
      return;
    }
    if (!projectNameInput.trim()) {
      showToast('Vui lòng nhập tên dự án!', 'warning');
      return;
    }
    if (!authorNameInput.trim()) {
      showToast('Vui lòng nhập tên người thực hiện!', 'warning');
      return;
    }

    setIsCreating(true);
    try {
      localStorage.setItem(LAST_AUTHOR_KEY, authorNameInput.trim());

      const newProject = await createProject({
        name: projectNameInput.trim(),
        author_name: authorNameInput.trim(),
        description: descriptionInput.trim(),
        settings: currentSettings,
        uploaded_outfits: (cloneCurrentWorkspace || currentUploadedOutfits.length > 0) ? currentUploadedOutfits : [],
        items: cloneCurrentWorkspace ? currentItems : [],
      });

      if (newProject) {
        localStorage.setItem(LAST_PROJECT_ID_KEY, newProject.id || '');
        onSelectProject(newProject);
        setIsNewProjectModalOpen(false);
        setProjectNameInput('');
        setDescriptionInput('');
        showToast(`Đã tạo và mở dự án "${newProject.name}" thành công!`, 'success');
      } else {
        showToast('Không thể tạo dự án trên Supabase. Vui lòng thử lại.', 'warning');
      }
    } catch (err: any) {
      showToast(err?.message || 'Lỗi khi tạo dự án.', 'warning');
    } finally {
      setIsCreating(false);
    }
  };

  // Load selected project and fill data
  const handleSelectAndLoadProject = (project: ProjectRecord) => {
    if (isGenerating) {
      showToast('Đang trong quá trình tạo ảnh/video AI dở! Vui lòng đợi hoàn tất trước khi chuyển dự án.', 'warning');
      return;
    }
    if (project.id) {
      localStorage.setItem(LAST_PROJECT_ID_KEY, project.id);
    }
    onSelectProject(project);
    setIsProjectsListModalOpen(false);
    showToast(`Đã nạp toàn bộ dữ liệu từ dự án "${project.name}"!`, 'success');
  };

  // Delete project handler
  const handleDeleteProject = async (project: ProjectRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project.id) return;
    const confirm = window.confirm(`Bạn có chắc muốn xóa vĩnh viễn dự án "${project.name}" không? Toàn bộ hình ảnh đã lưu trên Google Drive của dự án cũng sẽ bị xóa.`);
    if (!confirm) return;

    setDeletingProjectId(project.id);
    showToast(`Đang xóa dự án "${project.name}" và dọn dẹp ảnh trên Google Drive...`, 'info');
    try {
      const ok = await deleteProject(project.id);
      if (ok) {
        setProjectsList((prev) => prev.filter((p) => p.id !== project.id));
        showToast(`Đã xóa dự án "${project.name}" và hình ảnh Drive thành công!`, 'success');
      } else {
        showToast('Không thể xóa dự án. Vui lòng thử lại.', 'warning');
      }
    } catch (err: any) {
      showToast(err?.message || 'Lỗi khi xóa dự án.', 'warning');
    } finally {
      setDeletingProjectId(null);
    }
  };

  const [selectedAuthorFilter, setSelectedAuthorFilter] = useState<string | null>(null);

  // Extract author statistics and count of projects per author
  const authorStats = useMemo(() => {
    const map = new Map<string, number>();
    projectsList.forEach((p) => {
      const author = p.author_name?.trim() || 'Chưa đặt tên';
      map.set(author, (map.get(author) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }, [projectsList]);

  // Filtered projects by both author filter and search query
  const filteredProjects = projectsList.filter((p) => {
    if (selectedAuthorFilter) {
      const pAuthor = p.author_name?.trim() || 'Chưa đặt tên';
      if (pAuthor !== selectedAuthorFilter) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.author_name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  });

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return isoString;
    }
  };

  return (
    <>
      {/* Project Status Bar */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 border border-stone-800 rounded-2xl p-3 sm:p-4 shadow-md text-stone-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Left: Active Project Info */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-inner">
            <FolderKanban className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-stone-400">Dự án:</span>
              <span className="text-sm font-bold text-white tracking-tight">
                {currentProject ? currentProject.name : 'Giao diện mới (Chưa chọn dự án)'}
              </span>
              {currentProject?.author_name && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-stone-800 text-stone-300 border border-stone-700">
                  <User className="w-3 h-3 text-emerald-400" />
                  {currentProject.author_name}
                </span>
              )}
            </div>

            {/* Sync status & item counter */}
            <div className="flex items-center gap-3 text-xs text-stone-400 mt-0.5">
              <span className="flex items-center gap-1">
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    <span className="text-emerald-400 font-medium">Đang tự động đồng bộ Cloud...</span>
                  </>
                ) : isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                    <span className="text-indigo-300 font-medium">⚡ Đang tạo AI (tự động cập nhật dự án khi xong)</span>
                  </>
                ) : currentProject ? (
                  isDirty ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                      <span className="text-amber-300">Có thay đổi chưa lưu</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">Đã đồng bộ Cloud</span>
                    </>
                  )
                ) : (
                  <span className="text-stone-500">Chưa liên kết dự án</span>
                )}
              </span>

              {lastSavedAt && currentProject && (
                <span className="text-stone-500 text-[11px] hidden sm:inline">
                  • Cập nhật: {lastSavedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}

              <span className="text-stone-500 text-[11px]">
                • {currentItems.length} ảnh trong phiên
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center flex-wrap gap-2 self-end md:self-auto">
          {/* Save / Update Project Button */}
          {currentProject ? (
            <button
              type="button"
              onClick={() => {
                if (isGenerating) {
                  showToast('Đang trong quá trình tạo ảnh/video dở, vui lòng đợi hoàn tất trước khi lưu dự án!', 'warning');
                  return;
                }
                onSaveCurrentProject();
              }}
              disabled={isSaving || isGenerating}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-xs ${
                isGenerating
                  ? 'bg-stone-800/60 text-stone-500 border border-stone-800 cursor-not-allowed opacity-60'
                  : isDirty
                    ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse shadow-md shadow-amber-950/40'
                    : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700'
              }`}
              title={
                isGenerating
                  ? 'Đang có tác vụ tạo ảnh/video đang chạy dở, vui lòng đợi hoàn tất trước khi lưu'
                  : isDirty
                    ? `Cập nhật những thay đổi mới nhất vào dự án "${currentProject.name}" (Ctrl+S)`
                    : `Dự án "${currentProject.name}" đã được lưu mới nhất (bấm để cập nhật lại)`
              }
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {isSaving
                  ? 'Đang cập nhật...'
                  : isGenerating
                    ? 'Đang tạo AI...'
                    : isDirty
                      ? 'Lưu Thay Đổi Mới'
                      : 'Lưu Lại Dự Án'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isGenerating) {
                  showToast('Đang trong quá trình tạo ảnh/video dở, vui lòng đợi hoàn tất!', 'warning');
                  return;
                }
                setProjectNameInput('');
                setDescriptionInput('');
                setCloneCurrentWorkspace(true);
                setIsNewProjectModalOpen(true);
              }}
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition-all shadow-xs"
              title="Lưu phiên làm việc hiện tại thành một dự án mới"
            >
              <Save className="w-3.5 h-3.5 text-emerald-400" />
              <span>Lưu Thành Dự Án</span>
            </button>
          )}

          {/* Open Existing Projects Modal Button */}
          <button
            type="button"
            onClick={() => {
              if (isGenerating) {
                showToast('Đang trong quá trình tạo ảnh/video dở, không thể chuyển dự án lúc này!', 'warning');
                return;
              }
              handleOpenProjectsList();
            }}
            disabled={isGenerating}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shadow-xs ${
              isGenerating
                ? 'bg-stone-800/40 text-stone-500 border-stone-800 cursor-not-allowed opacity-60'
                : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700 hover:border-stone-600'
            }`}
            title={isGenerating ? 'Vui lòng đợi tác vụ tạo ảnh/video hoàn thành trước khi chuyển dự án' : 'Mở danh sách các dự án đã làm'}
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Chọn Dự Án Đã Làm</span>
          </button>

          {/* New Project Modal Button */}
          <button
            type="button"
            onClick={() => {
              if (isGenerating) {
                showToast('Đang trong quá trình tạo ảnh/video dở, không thể tạo dự án mới lúc này!', 'warning');
                return;
              }
              setProjectNameInput('');
              setDescriptionInput('');
              setCloneCurrentWorkspace(currentItems.length > 0 || currentUploadedOutfits.length > 0);
              setIsNewProjectModalOpen(true);
            }}
            disabled={isGenerating}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-md ${
              isGenerating
                ? 'bg-stone-800/40 text-stone-500 border-stone-800 cursor-not-allowed opacity-60 shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
            }`}
            title={isGenerating ? 'Vui lòng đợi tác vụ tạo ảnh/video hoàn thành trước khi tạo dự án mới' : 'Khởi tạo một dự án mới'}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Dự Án Mới</span>
          </button>
        </div>
      </div>


      {/* Modal: Tạo Dự Án Mới */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-stone-100">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Khởi Tạo Dự Án Mới</h3>
                  <p className="text-xs text-stone-400">Tạo phiên làm việc mới trên Supabase Cloud</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewProjectModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateNewProject} className="p-6 space-y-4">
              {/* Project Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-300 flex items-center justify-between">
                  <span>Tên Dự Án / Chiến Dịch <span className="text-rose-400">*</span></span>
                  <span className="text-[11px] text-stone-500 font-normal">Bắt buộc</span>
                </label>
                <input
                  type="text"
                  required
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  placeholder="VD: Chiến dịch Áo Thun Noel 2026, Cốc Sứ In Hình..."
                  className="w-full px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                  autoFocus
                />
              </div>

              {/* Author Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-300 flex items-center justify-between">
                  <span>Tên Người Thực Hiện <span className="text-rose-400">*</span></span>
                  <span className="text-[11px] text-stone-500 font-normal">Nhập mới hoặc chọn gợi ý bên dưới</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    list="saved-author-names-datalist"
                    value={authorNameInput}
                    onChange={(e) => setAuthorNameInput(e.target.value)}
                    placeholder="VD: Lê Thành Công, Mai Hà..."
                    className="w-full pl-10 pr-8 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                  />
                  {authorNameInput && (
                    <button
                      type="button"
                      onClick={() => setAuthorNameInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 p-0.5"
                      title="Xóa để nhập tên khác"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <datalist id="saved-author-names-datalist">
                    {authorStats.map(({ name }) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>

                {/* Loading state or Quick Suggestion Chips */}
                {isLoadingProjects ? (
                  <div className="pt-2 flex items-center gap-2 text-xs text-stone-400">
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    <span className="text-[11px] text-stone-400 font-medium animate-pulse">
                      Đang tải danh sách người thực hiện đã lưu...
                    </span>
                    <div className="flex items-center gap-1.5 ml-1">
                      <div className="h-6 w-20 rounded-lg bg-stone-850 animate-pulse border border-stone-800" />
                      <div className="h-6 w-24 rounded-lg bg-stone-850 animate-pulse border border-stone-800 hidden sm:block" />
                    </div>
                  </div>
                ) : authorStats.length > 0 ? (
                  <div className="pt-1.5 space-y-1">
                    <div className="flex items-center gap-1 text-[11px] text-stone-400 font-medium">
                      <Users className="w-3 h-3 text-emerald-400" />
                      <span>Chọn nhanh tên đã lưu trước đó:</span>
                    </div>
                    <div className="flex items-center flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                      {authorStats.map(({ name, count }) => {
                        const isSelected = authorNameInput.trim().toLowerCase() === name.toLowerCase();
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setAuthorNameInput(name)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
                              isSelected
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-bold shadow-xs'
                                : 'bg-stone-950 hover:bg-stone-850 text-stone-300 hover:text-white border-stone-800'
                            }`}
                          >
                            <User className={`w-3 h-3 ${isSelected ? 'text-emerald-400' : 'text-stone-500'}`} />
                            <span>{name}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                isSelected
                                  ? 'bg-emerald-950/40 text-emerald-300'
                                  : 'bg-stone-900 text-stone-500'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Description / Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-300">
                  Ghi chú / Mô tả dự án (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder="Ghi chú về yêu cầu khách hàng, phong cách, lưu ý..."
                  className="w-full px-3.5 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-none"
                />
              </div>

              {/* Clone option */}
              {(currentItems.length > 0 || currentUploadedOutfits.length > 0) && (
                <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="clone-workspace-checkbox"
                    checked={cloneCurrentWorkspace}
                    onChange={(e) => setCloneCurrentWorkspace(e.target.checked)}
                    className="mt-0.5 rounded border-stone-700 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="clone-workspace-checkbox" className="text-xs text-stone-300 cursor-pointer">
                    <span className="font-semibold block text-stone-200">
                      Sao chép {currentItems.length > 0 ? `${currentItems.length} ảnh` : ''} {currentUploadedOutfits.length > 0 ? `${currentUploadedOutfits.length} ảnh mẫu sản phẩm` : ''} và prompt thiết lập vào dự án mới này
                    </span>
                    <span className="text-[11px] text-stone-400">
                      Dữ liệu sẽ được tải lên Google Drive và lưu vào Google Sheets của dự án này.
                    </span>
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(false)}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                >
                  {isCreating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang tạo...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Tạo & Bắt Đầu Dự Án</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Danh Sách Dự Án Đã Lưu */}
      {isProjectsListModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-stone-100">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center text-white shadow-md">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Danh Sách Dự Án Đã Làm</h3>
                  <p className="text-xs text-stone-400">
                    Chọn một dự án để tự động phục hồi toàn bộ ảnh, video, prompt và thiết lập đã lưu
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadProjects(false)}
                  disabled={isLoadingProjects}
                  className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  title="Làm mới danh sách dự án"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingProjects ? 'animate-spin text-amber-400' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsProjectsListModalOpen(false)}
                  className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search & Author Filter Controls */}
            <div className="px-6 py-3 border-b border-stone-800 bg-stone-900/95 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center flex-1 gap-2 min-w-0">
                {/* Search input */}
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên dự án, mô tả..."
                    className="w-full pl-9 pr-8 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Smart Author Dropdown */}
                {authorStats.length > 0 && (
                  <div className="relative shrink-0">
                    <select
                      value={selectedAuthorFilter || ''}
                      onChange={(e) => setSelectedAuthorFilter(e.target.value || null)}
                      className={`appearance-none pl-8 pr-8 py-2 rounded-xl text-xs font-semibold cursor-pointer border transition-all focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                        selectedAuthorFilter
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/50 shadow-xs'
                          : 'bg-stone-950 text-stone-300 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <option value="" className="bg-stone-900 text-stone-200">
                        👤 Tất cả người làm ({projectsList.length})
                      </option>
                      {authorStats.map(({ name, count }) => (
                        <option key={name} value={name} className="bg-stone-900 text-stone-200">
                          {name} ({count} dự án)
                        </option>
                      ))}
                    </select>
                    <User className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                      selectedAuthorFilter ? 'text-amber-400' : 'text-stone-500'
                    }`} />
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsProjectsListModalOpen(false);
                  setIsNewProjectModalOpen(true);
                }}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tạo Dự Án Mới</span>
              </button>
            </div>

            {/* Quick Filter Tags (Flex-wrap, clean, no scrollbar) */}
            {isLoadingProjects ? (
              <div className="px-6 py-2.5 bg-stone-950/70 border-b border-stone-800/80 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-xs text-stone-400 font-medium animate-pulse">
                  Đang tải danh sách người thực hiện...
                </span>
                <div className="flex items-center gap-1.5 ml-2">
                  <div className="h-6 w-16 rounded-lg bg-stone-900 animate-pulse border border-stone-800" />
                  <div className="h-6 w-24 rounded-lg bg-stone-900 animate-pulse border border-stone-800" />
                  <div className="h-6 w-20 rounded-lg bg-stone-900 animate-pulse border border-stone-800 hidden sm:block" />
                </div>
              </div>
            ) : authorStats.length > 0 ? (
              <div className="px-6 py-2 bg-stone-950/70 border-b border-stone-800/80 flex items-center flex-wrap gap-1.5">
                <span className="text-[11px] text-stone-400 font-medium mr-1 flex items-center gap-1">
                  <Users className="w-3 h-3 text-amber-400" />
                  Lọc nhanh:
                </span>

                <button
                  type="button"
                  onClick={() => setSelectedAuthorFilter(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    selectedAuthorFilter === null
                      ? 'bg-amber-500 text-stone-950 shadow-sm font-bold'
                      : 'bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-stone-800'
                  }`}
                >
                  <span>Tất cả</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      selectedAuthorFilter === null
                        ? 'bg-amber-950/40 text-stone-950'
                        : 'bg-stone-950 text-stone-500'
                    }`}
                  >
                    {projectsList.length}
                  </span>
                </button>

                {authorStats.map(({ name, count }) => {
                  const isSelected = selectedAuthorFilter === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedAuthorFilter(isSelected ? null : name)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-amber-500 text-stone-950 shadow-sm font-bold'
                          : 'bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-white border border-stone-800'
                      }`}
                    >
                      <User className={`w-3 h-3 ${isSelected ? 'text-stone-950' : 'text-amber-400/80'}`} />
                      <span>{name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isSelected
                            ? 'bg-amber-950/40 text-stone-950'
                            : 'bg-stone-950 text-stone-400'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}

                {selectedAuthorFilter && (
                  <button
                    type="button"
                    onClick={() => setSelectedAuthorFilter(null)}
                    className="ml-auto text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md hover:bg-amber-950/30"
                    title="Xóa bộ lọc người thực hiện"
                  >
                    <X className="w-3 h-3" />
                    <span>Xóa lọc</span>
                  </button>
                )}
              </div>
            ) : null}

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
              {isLoadingProjects ? (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mb-3" />
                  <p className="text-sm text-stone-300 font-medium">Đang tải danh sách dự án từ Cloud...</p>
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center bg-stone-950/40 border border-dashed border-stone-800 rounded-2xl p-8">
                  <FolderOpen className="w-12 h-12 text-stone-600 mb-3" />
                  <h4 className="text-sm font-semibold text-stone-300 mb-1">
                    {searchQuery ? 'Không tìm thấy dự án nào phù hợp' : 'Chưa có dự án nào được lưu'}
                  </h4>
                  <p className="text-xs text-stone-500 max-w-sm mb-4">
                    Nhấn nút "Tạo Dự Án Mới" để lưu lại phiên làm việc đầu tiên của bạn.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredProjects.map((proj) => {
                    const isCurrent = currentProject?.id === proj.id;
                    const itemsCount = proj.items?.length || 0;
                    const completedCount = proj.items?.filter((it) => it.status === 'completed').length || 0;
                    const videoPromptsCount = proj.items?.filter((it) => it.videoPrompt && it.videoPrompt.trim().length > 0).length || 0;

                    const isDeleting = deletingProjectId === proj.id;

                    return (
                      <div
                        key={proj.id}
                        onClick={() => {
                          if (isDeleting) return;
                          handleSelectAndLoadProject(proj);
                        }}
                        className={`p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between group ${
                          isDeleting
                            ? 'opacity-80 border-rose-500/50 bg-rose-950/20 cursor-wait'
                            : isCurrent
                              ? 'bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-950/20 cursor-pointer'
                              : 'bg-stone-950 border-stone-800/80 hover:border-amber-500/60 hover:bg-stone-900/80 cursor-pointer'
                        }`}
                      >
                        {/* Loading Overlay when deleting */}
                        {isDeleting && (
                          <div className="absolute inset-0 bg-stone-950/90 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-200">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-2 shadow-inner">
                              <RefreshCw className="w-5 h-5 text-rose-400 animate-spin" />
                            </div>
                            <span className="text-xs font-bold text-rose-300">Đang xóa dự án & ảnh...</span>
                            <span className="text-[11px] text-stone-400 mt-0.5">Dọn dẹp Google Drive & Google Sheet</span>
                          </div>
                        )}

                        <div>
                          {/* Top row: Name & Active badge */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="p-2 rounded-lg bg-stone-800/90 text-amber-400 group-hover:bg-amber-500 group-hover:text-stone-950 transition-colors">
                                <FolderKanban className="w-4 h-4" />
                              </span>
                              <div>
                                <h4 className="text-sm font-bold text-stone-100 group-hover:text-white transition-colors">
                                  {proj.name}
                                </h4>
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-400 mt-0.5">
                                  <User className="w-3 h-3 text-emerald-400" />
                                  {proj.author_name}
                                </span>
                              </div>
                            </div>

                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                Đang Mở
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          {proj.description && (
                            <p className="text-xs text-stone-400 mt-2 line-clamp-2 bg-stone-900/60 p-2 rounded-lg border border-stone-800/60">
                              {proj.description}
                            </p>
                          )}

                          {/* Stats */}
                          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-stone-800/80 text-[11px] text-stone-400">
                            <span className="flex items-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                              {completedCount}/{itemsCount} ảnh hoàn thành
                            </span>
                            {videoPromptsCount > 0 && (
                              <span className="flex items-center gap-1">
                                • <Film className="w-3.5 h-3.5 text-emerald-400" />
                                {videoPromptsCount} prompt video
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Footer actions */}
                        <div className="flex items-center justify-between mt-3 pt-2 text-[10px] text-stone-500 border-t border-stone-800/60">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDateTime(proj.updated_at || proj.created_at)}
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => handleDeleteProject(proj, e)}
                              disabled={Boolean(deletingProjectId)}
                              className={`p-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
                                isDeleting
                                  ? 'bg-rose-950/60 text-rose-400 border border-rose-800/60 cursor-wait'
                                  : 'text-stone-500 hover:text-rose-400 hover:bg-stone-800/80'
                              }`}
                              title={isDeleting ? 'Đang xóa...' : 'Xóa vĩnh viễn dự án'}
                            >
                              {isDeleting ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                                  <span className="text-[11px] text-rose-300">Đang xóa...</span>
                                </>
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 group-hover:text-amber-300">
                              Mở dự án
                              <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-stone-800 bg-stone-950 flex items-center justify-between text-xs text-stone-400">
              <span>Tổng số: <strong>{filteredProjects.length}</strong> dự án trên Supabase Cloud</span>
              <button
                type="button"
                onClick={() => setIsProjectsListModalOpen(false)}
                className="px-4 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg font-medium transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
