# About 检查更新
About 打开后复用 Main 的既有 updater 检查，显示当前安装版本以及检查状态、最新可用
版本或失败原因。按钮可再次检查；开发/禁用更新环境必须明确提示，不谎称最新版。
已下载的更新在 About 自动检查时只展示，不自动重启。安装仍要求点击重启更新。

Main updater 是唯一状态所有者；About 是订阅者，关闭即解除订阅。沿用平台/渠道、
签名、下载及安装机制，不建立第二个更新器。自定义 ZenCode 发布源由用户指定为 bennix/ZCode，
不得把原版仓库当作定制版本的默认发布源。About 的沙箱页只允许固定操作消息，
不接受网页提供的更新 URL 或可执行代码。

验收：当前版本显示、检查中禁用重复操作、新版本显示版本号、失败可重试、开发模式
有明确提示、下载进度/已下载展示、打开 About 不触发重启。UI 使用中英文文案。

## GitHub Releases 源
发布源唯一配置为 packages/desktop/update-source.json 的 repository（owner/repo）。
构建时写入 build-meta.json，运行时只读构建元数据，环境变量不允许改道正式包。
当前配置为 bennix/ZCode。未指定仓库时显示“未配置发布仓库”，不回退原版更新服务。使用 electron-updater 的
GitHub provider：版本比较、平台/架构资产选择、SHA512 和现有签名/安装检查均复用。
Release 需同时上传构建出的 latest*.yml、zip/dmg 或 exe/AppImage 及 blockmap；
仅上传源码 zip 或 CI 临时 artifact 不构成自动更新发布。macOS 自动更新需签名。
