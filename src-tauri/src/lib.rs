use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessResult {
    pub original_size: u64,
    pub new_size: u64,
    pub output_path: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
}

fn get_file_size(path: &str) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

#[tauri::command]
fn get_file_info(path: String) -> FileInfo {
    let size = get_file_size(&path);
    let name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    FileInfo { path, name, size }
}

#[tauri::command]
fn compress_image(path: String, quality: u8, output_path: Option<String>) -> ProcessResult {
    let original_size = get_file_size(&path);
    let output = output_path.unwrap_or_else(|| path.clone());

    let img = match image::open(&path) {
        Ok(img) => img,
        Err(e) => {
            return ProcessResult {
                original_size,
                new_size: 0,
                output_path: output,
                success: false,
                error: Some(format!("无法读取图片: {}", e)),
            };
        }
    };

    let path_lower = path.to_lowercase();
    let is_png = path_lower.ends_with(".png");
    let quality = quality.min(100).max(1);

    let mut buffer = Cursor::new(Vec::new());

    let result = if is_png {
        let encoder = image::codecs::png::PngEncoder::new(&mut buffer);
        img.write_with_encoder(encoder)
    } else {
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, quality);
        img.write_with_encoder(encoder)
    };

    if let Err(e) = result {
        return ProcessResult {
            original_size,
            new_size: 0,
            output_path: output,
            success: false,
            error: Some(format!("编码失败: {}", e)),
        };
    }

    let encoded = buffer.into_inner();
    let new_size = encoded.len() as u64;

    if let Err(e) = fs::write(&output, encoded) {
        return ProcessResult {
            original_size,
            new_size,
            output_path: output,
            success: false,
            error: Some(format!("写入失败: {}", e)),
        };
    }

    ProcessResult {
        original_size,
        new_size,
        output_path: output,
        success: true,
        error: None,
    }
}

#[tauri::command]
fn convert_to_webp(path: String, quality: u8, output_path: Option<String>) -> ProcessResult {
    let original_size = get_file_size(&path);

    let img = match image::open(&path) {
        Ok(img) => img,
        Err(e) => {
            return ProcessResult {
                original_size,
                new_size: 0,
                output_path: path.clone(),
                success: false,
                error: Some(format!("无法读取图片: {}", e)),
            };
        }
    };

    let output = output_path.unwrap_or_else(|| {
        let p = Path::new(&path);
        let parent = p.parent().map(|pp| pp.to_string_lossy().to_string()).unwrap_or_default();
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
        if parent.is_empty() {
            format!("{}.webp", stem)
        } else {
            format!("{}/{}.webp", parent, stem)
        }
    });

    let rgb_img = img.to_rgb8();
    let encoder = webp::Encoder::from_rgb(rgb_img.as_raw(), rgb_img.width(), rgb_img.height());
    let webp_data = encoder.encode(quality as f32);

    let new_size = webp_data.len() as u64;

    if let Err(e) = fs::write(&output, &*webp_data) {
        return ProcessResult {
            original_size,
            new_size,
            output_path: output,
            success: false,
            error: Some(format!("写入失败: {}", e)),
        };
    }

    ProcessResult {
        original_size,
        new_size,
        output_path: output,
        success: true,
        error: None,
    }
}

#[tauri::command]
fn convert_to_jpg(path: String, quality: u8, output_path: Option<String>) -> ProcessResult {
    let original_size = get_file_size(&path);

    let img = match image::open(&path) {
        Ok(img) => img,
        Err(e) => {
            return ProcessResult {
                original_size,
                new_size: 0,
                output_path: path.clone(),
                success: false,
                error: Some(format!("无法读取图片: {}", e)),
            };
        }
    };

    let output = output_path.unwrap_or_else(|| {
        let p = Path::new(&path);
        let parent = p.parent().map(|pp| pp.to_string_lossy().to_string()).unwrap_or_default();
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
        if parent.is_empty() {
            format!("{}.jpg", stem)
        } else {
            format!("{}/{}.jpg", parent, stem)
        }
    });

    let rgb_img = img.to_rgb8();
    let mut buffer = Cursor::new(Vec::new());
    let quality = quality.min(100).max(1);

    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, quality);
    if let Err(e) = rgb_img.write_with_encoder(encoder) {
        return ProcessResult {
            original_size,
            new_size: 0,
            output_path: output,
            success: false,
            error: Some(format!("编码失败: {}", e)),
        };
    }

    let encoded = buffer.into_inner();
    let new_size = encoded.len() as u64;

    if let Err(e) = fs::write(&output, encoded) {
        return ProcessResult {
            original_size,
            new_size,
            output_path: output,
            success: false,
            error: Some(format!("写入失败: {}", e)),
        };
    }

    ProcessResult {
        original_size,
        new_size,
        output_path: output,
        success: true,
        error: None,
    }
}

#[tauri::command]
fn resize_image(
    path: String,
    target_size: u32,
    force_enlarge: bool,
    output_format: String,
    quality: u8,
    output_path: Option<String>,
) -> ProcessResult {
    let original_size = get_file_size(&path);

    let img = match image::open(&path) {
        Ok(img) => img,
        Err(e) => {
            return ProcessResult {
                original_size,
                new_size: 0,
                output_path: path.clone(),
                success: false,
                error: Some(format!("无法读取图片: {}", e)),
            };
        }
    };

    let orig_width = img.width();
    let orig_height = img.height();
    let longest_edge = orig_width.max(orig_height);

    let should_resize = if force_enlarge {
        longest_edge != target_size
    } else {
        longest_edge > target_size
    };

    let (new_width, new_height) = if should_resize {
        if longest_edge == orig_width {
            let new_w = target_size;
            let new_h = (orig_height * target_size / longest_edge) as u32;
            (new_w, new_h)
        } else {
            let new_h = target_size;
            let new_w = (orig_width * target_size / longest_edge) as u32;
            (new_w, new_h)
        }
    } else {
        (orig_width, orig_height)
    };

    let resized = if should_resize {
        img.resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let rgb_img = resized.to_rgb8();
    let quality = quality.min(100).max(1);

    let path_lower = path.to_lowercase();
    let is_webp_orig = path_lower.ends_with(".webp");

    let actual_format = if output_format == "webp" {
        "webp"
    } else if is_webp_orig {
        "webp"
    } else if path_lower.ends_with(".png") {
        "png"
    } else {
        "jpg"
    };

    let output = output_path.unwrap_or_else(|| {
        let p = Path::new(&path);
        let parent = p.parent().map(|pp| pp.to_string_lossy().to_string()).unwrap_or_default();
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
        let ext = if actual_format == "webp" { "webp" } else { "jpg" };
        if parent.is_empty() {
            format!("{}.{}", stem, ext)
        } else {
            format!("{}/{}.{}", parent, stem, ext)
        }
    });

    // 创建输出目录（多尺寸模式下 React 已拼接好路径，如 /原图目录/800px/）
    if let Some(parent) = Path::new(&output).parent() {
        if !parent.as_os_str().is_empty() {
            let _ = fs::create_dir_all(parent);
        }
    }

    let new_size: u64 = if actual_format == "webp" {
        let encoder = webp::Encoder::from_rgb(rgb_img.as_raw(), rgb_img.width(), rgb_img.height());
        let webp_data = encoder.encode(quality as f32);
        let size = webp_data.len() as u64;
        if let Err(e) = fs::write(&output, &*webp_data) {
            return ProcessResult {
                original_size,
                new_size: 0,
                output_path: output,
                success: false,
                error: Some(format!("写入失败: {}", e)),
            };
        }
        size
    } else {
        let mut buffer = Cursor::new(Vec::new());
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, quality);
        if let Err(e) = rgb_img.write_with_encoder(encoder) {
            return ProcessResult {
                original_size,
                new_size: 0,
                output_path: output,
                success: false,
                error: Some(format!("编码失败: {}", e)),
            };
        }
        let encoded = buffer.into_inner();
        let size = encoded.len() as u64;
        if let Err(e) = fs::write(&output, encoded) {
            return ProcessResult {
                original_size,
                new_size: 0,
                output_path: output,
                success: false,
                error: Some(format!("写入失败: {}", e)),
            };
        }
        size
    };

    ProcessResult {
        original_size,
        new_size,
        output_path: output,
        success: true,
        error: None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_file_info,
            compress_image,
            convert_to_webp,
            convert_to_jpg,
            resize_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
