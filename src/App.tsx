import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface FileItem {
  id: string;
  name: string;
  path: string;
  originalSize: number;
  newSize: number | null;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  targetSize?: number; // 用于调整 TAB，标记这张图的目标尺寸
}

type TabType = "compress" | "convert" | "resize";
type ConvertMode = "toWebp" | "toJpg";
type OutputMode = "overwrite" | "saveAs";
type ResizeFormat = "keep" | "webp";
type ResizeSaveMode = "sameDir" | "saveAs"; // sameDir=原文件夹(webp用) / 覆盖(原格式用)

function formatSize(bytes: number | null): string {
  if (bytes === null) return "...";
  if (bytes === 0) return "0KB";
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  return `${Math.round(bytes / 1024)}KB`;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>("compress");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // 压缩设置
  const [compressQuality, setCompressQuality] = useState(75);
  const compressQualityOptions = [45, 75];
  const [compressOutputMode, setCompressOutputMode] = useState<OutputMode>("overwrite");
  const [compressSavePath, setCompressSavePath] = useState<string | null>(null);

  // 转换设置
  const [convertMode, setConvertMode] = useState<ConvertMode>("toWebp");
  const [convertQuality, setConvertQuality] = useState(75);
  const convertQualityOptions = [45, 75];
  const [convertOutputMode, setConvertOutputMode] = useState<OutputMode>("overwrite");
  const [convertSavePath, setConvertSavePath] = useState<string | null>(null);

  // 调整设置
  const [resizeSelectedSizes, setResizeSelectedSizes] = useState<number[]>([800]);
  const resizeSizeOptions = [400, 800, 1024, 1200];
  const [resizeKeepSmall, setResizeKeepSmall] = useState(true);
  const [resizeFormat, setResizeFormat] = useState<ResizeFormat>("keep");
  const [resizeQuality, setResizeQuality] = useState(75);
  const resizeQualityOptions = [45, 75];
  const [resizeSaveMode, setResizeSaveMode] = useState<ResizeSaveMode>("sameDir");
  const [resizeSavePath, setResizeSavePath] = useState<string | null>(null);

  const hasFiles = files.length > 0;

  // 处理单个文件
  const processFile = useCallback(
    async (file: FileItem) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, status: "processing" } : f))
      );

      try {
        let result: any;

        if (activeTab === "compress") {
          const outputPath =
            compressOutputMode === "saveAs" && compressSavePath
              ? `${compressSavePath}/${file.name}`
              : null;

          result = await invoke("compress_image", {
            path: file.path,
            quality: compressQuality,
            outputPath,
          });
        } else if (activeTab === "convert") {
          if (convertMode === "toWebp") {
            const outputPath =
              convertOutputMode === "saveAs" && convertSavePath
                ? `${convertSavePath}/${file.name.replace(/\.[^.]+$/, ".webp")}`
                : null;

            result = await invoke("convert_to_webp", {
              path: file.path,
              quality: convertQuality,
              outputPath,
            });
          } else {
            const outputPath =
              convertOutputMode === "saveAs" && convertSavePath
                ? `${convertSavePath}/${file.name.replace(/\.[^.]+$/, ".jpg")}`
                : null;

            result = await invoke("convert_to_jpg", {
              path: file.path,
              quality: convertQuality,
              outputPath,
            });
          }
        } else if (activeTab === "resize") {
          // 调整模式：每个尺寸生成一个输出文件
          // 依次处理每个尺寸
          const sizes = resizeSelectedSizes;
          let allSuccess = true;
          let lastError: string | undefined;
          let totalNewSize = 0;

          for (const size of sizes) {
            const outputFormat = resizeFormat;
            let outputPath: string | null = null;

            if (resizeSaveMode === "saveAs" && resizeSavePath) {
              // 另存至：在另存的文件夹下按尺寸创建子文件夹
              const origExt = file.name.replace(/.*\.(.*)$/, "$1").toLowerCase();
              const ext = resizeFormat === "webp" ? ".webp" : (origExt === "png" ? ".png" : ".jpg");
              const baseName = file.name.replace(/\.[^.]+$/, "");
              outputPath = `${resizeSavePath}/${size}px/${baseName}${ext}`;
            } else if (resizeSaveMode === "sameDir") {
              // 原文件夹：在原图所在文件夹按尺寸创建子文件夹
              const lastSep = Math.max(file.path.lastIndexOf("/"), file.path.lastIndexOf("\\"));
              const parent = file.path.substring(0, lastSep);
              const origExt = file.name.replace(/.*\.(.*)$/, "$1").toLowerCase();
              const ext = resizeFormat === "webp" ? ".webp" : (origExt === "png" ? ".png" : ".jpg");
              const baseName = file.name.replace(/\.[^.]+$/, "");
              outputPath = `${parent}/${size}px/${baseName}${ext}`;
            }

            const res: any = await invoke("resize_image", {
              path: file.path,
              targetSize: size,
              forceEnlarge: !resizeKeepSmall,
              outputFormat,
              quality: resizeQuality,
              outputPath,
            });

            totalNewSize += res.new_size;
            if (!res.success) {
              allSuccess = false;
              lastError = res.error;
            }
          }

          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? {
                    ...f,
                    status: allSuccess ? "success" : "error",
                    newSize: totalNewSize,
                    error: lastError,
                  }
                : f
            )
          );
          return;
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  status: result.success ? "success" : "error",
                  newSize: result.new_size,
                  error: result.error,
                }
              : f
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? { ...f, status: "error", error: String(err) }
              : f
          )
        );
      }
    },
    [
      activeTab,
      compressQuality,
      compressOutputMode,
      compressSavePath,
      convertMode,
      convertQuality,
      convertOutputMode,
      convertSavePath,
      resizeSelectedSizes,
      resizeKeepSmall,
      resizeFormat,
      resizeQuality,
      resizeSaveMode,
      resizeSavePath,
    ]
  );

  // 处理文件列表
  useEffect(() => {
    if (files.length > 0) {
      const pendingFiles = files.filter((f) => f.status === "pending");
      if (pendingFiles.length > 0) {
        processFile(pendingFiles[0]);
      }
    }
  }, [files, processFile]);

  // 拖拽处理 - 使用 Tauri 2.x 的拖拽事件
  useEffect(() => {
    const unlisten = import("@tauri-apps/api/event").then(({ listen }) => {
      return listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          const newFiles: FileItem[] = [];
          for (const filePath of paths) {
            const ext = filePath.toLowerCase();
            if (/\.(jpg|jpeg|png|webp)$/.test(ext)) {
              try {
                const fileInfo: any = await invoke("get_file_info", { path: filePath });
                newFiles.push({
                  id: generateId(),
                  name: fileInfo.name,
                  path: fileInfo.path,
                  originalSize: fileInfo.size,
                  newSize: null,
                  status: "pending",
                });
              } catch {
                const name = filePath.split(/[/\\]/).pop() || filePath;
                newFiles.push({
                  id: generateId(),
                  name,
                  path: filePath,
                  originalSize: 0,
                  newSize: null,
                  status: "pending",
                });
              }
            }
          }
          if (newFiles.length > 0) {
            setFiles((prev) => [...prev, ...newFiles]);
          }
        }
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleClick = async () => {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "Images",
          extensions: ["jpg", "jpeg", "png", "webp"],
        },
      ],
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];

      const newFiles: FileItem[] = [];
      for (const path of paths) {
        try {
          const fileInfo: any = await invoke("get_file_info", { path });
          newFiles.push({
            id: generateId(),
            name: fileInfo.name,
            path: fileInfo.path,
            originalSize: fileInfo.size,
            newSize: null,
            status: "pending",
          });
        } catch {
          const name = path.split(/[/\\]/).pop() || path;
          newFiles.push({
            id: generateId(),
            name,
            path,
            originalSize: 0,
            newSize: null,
            status: "pending",
          });
        }
      }

      setFiles(newFiles);
    }
  };

  const clearFiles = () => {
    setFiles([]);
  };

  const selectFolder = async (mode: "compress" | "convert" | "resize") => {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected && typeof selected === "string") {
      if (mode === "compress") {
        setCompressSavePath(selected);
      } else if (mode === "convert") {
        setConvertSavePath(selected);
      } else {
        setResizeSavePath(selected);
      }
    }
  };

  const toggleSize = (size: number) => {
    setResizeSelectedSizes((prev) => {
      if (prev.includes(size)) {
        // 如果只剩一个不要取消，至少保留一个
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== size);
      } else {
        return [...prev, size].sort((a, b) => a - b);
      }
    });
  };

  return (
    <div className="app">
      {/* TAB 栏 */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "compress" ? "active" : ""}`}
          onClick={() => setActiveTab("compress")}
        >
          图片压缩
        </button>
        <button
          className={`tab ${activeTab === "convert" ? "active" : ""}`}
          onClick={() => setActiveTab("convert")}
        >
          Webp转换
        </button>
        <button
          className={`tab ${activeTab === "resize" ? "active" : ""}`}
          onClick={() => setActiveTab("resize")}
        >
          图片调整
        </button>
      </div>

      {/* 设置面板（仅无文件时显示） */}
      {!hasFiles && (
      <div className="settings">
        {activeTab === "compress" && (
          <>
            <div className="settings-row">
              <div className="settings-label">压缩质量</div>
              <div className="quality-buttons">
                {compressQualityOptions.map((q) => (
                  <button
                    key={q}
                    className={`quality-btn ${compressQuality === q ? "active" : ""}`}
                    onClick={() => setCompressQuality(q)}
                  >
                    {q}%
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row">
              <div className="radio-group">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="compress-output"
                    checked={compressOutputMode === "overwrite"}
                    onChange={() => setCompressOutputMode("overwrite")}
                  />
                  <span className="radio-circle"></span>
                  覆盖原文件
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="compress-output"
                    checked={compressOutputMode === "saveAs"}
                    onChange={() => setCompressOutputMode("saveAs")}
                  />
                  <span className="radio-circle"></span>
                  另存至
                </label>
                {compressOutputMode === "saveAs" && (
                  <button
                    className="folder-btn"
                    onClick={() => selectFolder("compress")}
                  >
                    {compressSavePath
                      ? compressSavePath.split(/[/\\]/).pop()
                      : "选择文件夹"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "convert" && (
          <>
            <div className="settings-row">
              <div className="settings-label">转换模式</div>
              <div className="mode-buttons">
                <button
                  className={`mode-btn ${convertMode === "toWebp" ? "active" : ""}`}
                  onClick={() => setConvertMode("toWebp")}
                >
                  JPG转Webp
                </button>
                <button
                  className={`mode-btn ${convertMode === "toJpg" ? "active" : ""}`}
                  onClick={() => setConvertMode("toJpg")}
                >
                  Webp转JPG
                </button>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-label">转换质量</div>
              <div className="quality-buttons">
                {convertQualityOptions.map((q) => (
                  <button
                    key={q}
                    className={`quality-btn ${convertQuality === q ? "active" : ""}`}
                    onClick={() => setConvertQuality(q)}
                  >
                    {q}%
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row">
              <div className="radio-group">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="convert-output"
                    checked={convertOutputMode === "overwrite"}
                    onChange={() => setConvertOutputMode("overwrite")}
                  />
                  <span className="radio-circle"></span>
                  保存至原文件夹
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="convert-output"
                    checked={convertOutputMode === "saveAs"}
                    onChange={() => setConvertOutputMode("saveAs")}
                  />
                  <span className="radio-circle"></span>
                  另存至
                </label>
                {convertOutputMode === "saveAs" && (
                  <button
                    className="folder-btn"
                    onClick={() => selectFolder("convert")}
                  >
                    {convertSavePath
                      ? convertSavePath.split(/[/\\]/).pop()
                      : "选择文件夹"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "resize" && (
          <>
            {/* 目标尺寸（可多选） */}
            <div className="settings-row">
              <div className="settings-label">目标尺寸</div>
              <div className="quality-buttons">
                {resizeSizeOptions.map((size) => (
                  <button
                    key={size}
                    className={`quality-btn ${resizeSelectedSizes.includes(size) ? "active" : ""}`}
                    onClick={() => toggleSize(size)}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </div>
            {/* 图片较小时保持原样 */}
            <div className="settings-row">
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={resizeKeepSmall}
                  onChange={(e) => setResizeKeepSmall(e.target.checked)}
                />
                <span className="checkbox-box"></span>
                图片较小时保持原样（不放大）
              </label>
            </div>
            {/* 输出格式 */}
            <div className="settings-row">
              <div className="settings-label">输出格式</div>
              <div className="mode-buttons">
                <button
                  className={`mode-btn ${resizeFormat === "keep" ? "active" : ""}`}
                  onClick={() => setResizeFormat("keep")}
                >
                  保持原格式
                </button>
                <button
                  className={`mode-btn ${resizeFormat === "webp" ? "active" : ""}`}
                  onClick={() => setResizeFormat("webp")}
                >
                  转为Webp
                </button>
              </div>
            </div>
            {/* 转换质量 */}
            <div className="settings-row">
              <div className="settings-label">转换质量</div>
              <div className="quality-buttons">
                {resizeQualityOptions.map((q) => (
                  <button
                    key={q}
                    className={`quality-btn ${resizeQuality === q ? "active" : ""}`}
                    onClick={() => setResizeQuality(q)}
                  >
                    {q}%
                  </button>
                ))}
              </div>
            </div>
            {/* 保存方式 */}
            <div className="settings-row">
              <div className="radio-group">
                {resizeFormat === "keep" ? (
                  <>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="resize-save"
                        checked={resizeSaveMode === "sameDir"}
                        onChange={() => setResizeSaveMode("sameDir")}
                      />
                      <span className="radio-circle"></span>
                      保存至原文件夹
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="resize-save"
                        checked={resizeSaveMode === "saveAs"}
                        onChange={() => setResizeSaveMode("saveAs")}
                      />
                      <span className="radio-circle"></span>
                      另存至
                    </label>
                  </>
                ) : (
                  <>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="resize-save"
                        checked={resizeSaveMode === "sameDir"}
                        onChange={() => setResizeSaveMode("sameDir")}
                      />
                      <span className="radio-circle"></span>
                      保存至原文件夹
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="resize-save"
                        checked={resizeSaveMode === "saveAs"}
                        onChange={() => setResizeSaveMode("saveAs")}
                      />
                      <span className="radio-circle"></span>
                      另存至
                    </label>
                  </>
                )}
                {resizeSaveMode === "saveAs" && (
                  <button
                    className="folder-btn"
                    onClick={() => selectFolder("resize")}
                  >
                    {resizeSavePath
                      ? resizeSavePath.split(/[/\\]/).pop()
                      : "选择文件夹"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {/* 拖拽区域 / 文件列表 */}
      {!hasFiles ? (
        <div
          className={`dropzone ${isDragging ? "dragover" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <div className="dropzone-icon">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="56" height="56" rx="12" fill="#EEF2FF"/>
              <rect x="12" y="16" width="32" height="24" rx="3" stroke="#6366F1" stroke-width="2" fill="none"/>
              <circle cx="21" cy="23" r="3" fill="#6366F1"/>
              <path d="M12 32L20 25L27 31L35 23L44 32" stroke="#6366F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              <path d="M38 12V18M44 18H38" stroke="#6366F1" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div className="dropzone-text">将图片拖入此处，或点击选择文件</div>
        </div>
      ) : (
        <div className="file-list">
          {files.map((file) => (
            <div key={file.id} className="file-item">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatSize(file.originalSize)}</span>
              <span className="file-arrow">→</span>
              <span className="file-new-size">
                {formatSize(file.newSize)}
              </span>
              <span className={`file-status ${file.status}`}>
                {file.status === "pending" && "⏳ 等待"}
                {file.status === "processing" && "⟳ 处理中"}
                {file.status === "success" && "✓ 完成"}
                {file.status === "error" && "✗ 失败"}
              </span>
            </div>
          ))}
          <button className="clear-btn" onClick={clearFiles}>
            清空列表
          </button>
        </div>
      )}

      {/* 底部角标 */}
      <div className="footer">
        本工具由@常宁千影设计&nbsp;&nbsp;Photomini V1.1.3
      </div>
    </div>
  );
}

export default App;
