# ZenMUx 应用图标

## 产品规则与所有者

- 桌面应用、Dock、窗口、托盘、安装程序、安装卷以及应用内品牌图标使用同一个 ZenMUx 章鱼标识；不能出现旧的 `worker` 字样或 Z 字母图案。
- 图标以一个 SVG 源文件为视觉所有者。深色立体圆角底、青蓝与紫色高光、白色章鱼须在小尺寸下保持可辨识。macOS 图标保留透明画布和安全留白，不添加系统自行提供的边框或文字。
- 从 SVG 导出的 PNG、ICNS、ICO 与 Linux 尺寸图为构建资源；运行时和 electron-builder 只读取这些资源，不再各自维护不同视觉版本。

## 接口与验收

- `build/icon.png` 为运行时主图；`build/icon.icns` 为 macOS app；`build/icon.ico` 为 Windows app 与托盘；`build/icons/*` 为 Linux；`build/icon_installer.*` 为安装程序/安装卷。公开网页及应用内品牌预览使用同一视觉。
- macOS 安装后的 `.app`、开发态 Dock、关于窗口、更新提示和权限提示显示 ZenMUx；Windows、Linux、安装程序及安装卷也显示相同标识。
- Web 标签页的内嵌 favicon 与 `/favicon.ico`、应用内 About 图标、强制更新窗口和应用 Shell 的 logo 属性均显示这套图标。About 与强制更新窗口从已打包的 `resources/icon.png` 读取，开发态从 `build/icon.png` 读取；图标缺失时窗口仍能显示文案。
- 浏览器所访问的网站 favicon、第三方模型供应商与 OAuth 品牌标识属于外部身份，不作为本应用图标替换。
- 16–1024 px 图标尺寸正确，有 alpha 通道；macOS ICNS 包含标准 1x/2x 尺寸，Windows ICO 包含多种尺寸。任何导出物不得含旧 `worker` 字样。
