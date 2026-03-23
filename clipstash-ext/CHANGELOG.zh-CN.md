# 更新日志

本文档记录此项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-03-23

### 新增

- **云同步** — 通过 GitHub Gist 跨设备同步剪贴板数据；使用细粒度 PAT（Gists 读写权限）连接
- **自动同步** — 自动推送本地变更，定时拉取远端更新（5 分钟间隔）
- **快速同步按钮** — 顶栏快捷按钮，一键手动同步
- **同步状态指示** — 扩展 Badge 显示同步状态（同步中 / 已连接 / 错误）
- **回收站** — 软删除，保留 30 天；支持恢复或永久删除
- **回收站批量操作** — "全部恢复"和"清空回收站"按钮
- **永久删除全部数据** — 设置中的危险操作，可永久清除所有数据（活跃 + 回收站）
- **共享模块** — 提取 `shared/` 目录，包含 `constants.js`、`messages.js`、`icons.js`、`dom-utils.js`、`fullscreen-controller.js`，供扩展和桌面端共用
- **模块化架构** — `popup.js` 拆分为独立模块：`card-renderer.js`、`modal-controller.js`、`trash-panel.js`、`sync-ui.js`、`settings-panel.js`

### 变更

- **国际化架构** — 共享 `BASE_MESSAGES` + 平台特定 `EXT_MESSAGES`；`mergeMessages()` 函数实现组合式翻译
- **时间格式化** — 委托给共享 `dom-utils.js`，通过依赖注入 `t()` 函数
- **代码组织** — `popup.js` 从约 1200 行缩减至约 290 行；`fullscreen.js` 使用共享 `fullscreen-controller.js`
- **Service Worker** — 为 `chrome.action.openPopup()` 添加 `try/catch`，提升受限环境下的健壮性
- **扩展清单** — 新增 `alarms` 权限和 GitHub API 的 `host_permissions`
- **存储层** — 新增回收站操作、同步数据转换及 GitHub Gist API 集成

### 修复

- **同步数据格式** — `updated_at` 字段在 snake_case 记录转换中正确包含

## [0.1.3] - 2026-03-20

### 新增

- **全屏页面** — 在新标签页中全屏展示缓存内容，支持文本、代码（语法高亮）、图片和 HTML 富文本
- **全屏内联编辑** — 在全屏页面直接编辑文本，实时语法高亮预览、自动增长输入框、同步滚动
- **浮动工具栏** — 复制和编辑按钮浮动在内容区域右上角，带背景模糊效果；三级渐进透明度（0.25 → 0.75 → 1）避免遮挡文本
- **编辑模式指示条** — 进入编辑模式后 header 切换为绿色「✏️ 编辑中」指示条，配有明确的取消/保存按钮
- **未保存变更确认** — 取消编辑时如有未保存修改，弹出确认对话框
- **卡片 ID 标签** — 详情弹窗 header 显示 `#短ID`（随机 hex 后缀），等宽字体标签样式
- **标签重复检测** — 输入已存在标签时，输入框红色边框抖动 + 显示「该标签已存在」提示
- **标签输入自动关闭** — 标签输入框失焦后 150ms 自动关闭（延迟避免点击冲突）
- **常量模块** — 提取所有魔法数字和配置值到 `constants.js`
- **错误处理** — 为所有存储操作（`addCache`、`removeCache`、`clearAllCaches`、`updateCacheTags`、`togglePin`、`updateCacheContent`、`updateCacheLanguage`、`saveTheme`、`exportCaches`、`importCaches`）、剪贴板读取（`readClipboardViaScript`、`readClipboardViaOffscreen`）和缓存流程（`cacheClipboard` 失败时显示红色 ✗ badge）添加完整的 `console.error` 日志
- **公共 API** — 导出 `getCaches` 函数供外部使用
- **国际化** — 新增 `fullscreen`、`edit`、`editing`、`cancelEdit`、`saveEdit`、`save`、`syntaxLang`、`addTagHint`、`tagExists`、`unsavedTitle`、`unsavedDesc`、`discardChanges` 翻译

### 变更

- **编辑模式重构** — 从单按钮 toggle 重构为 `enterEditMode()` / `saveEdit()` / `cancelEdit()` 三函数架构
- **移除底部 footer** — 复制/编辑按钮移至浮动工具栏；统计信息移至底部状态栏
- **标签区域重新设计** — 内联流式布局 + `+` 圆形按钮（虚线边框）；无标签时显示「+ 添加标签」，有标签时仅显示图标
- **语言选择器迁移** — 从标签区域移至状态栏右侧
- **多页面样式统一** — 提取共享 CSS 类（`.content-toolbar`、`.toolbar-btn`）统一 modal 和全屏页面
- **工具栏按钮透明度** — 三级渐进透明度：默认 0.25 → 内容区域悬停 0.75 → 按钮悬停 1
- **代码重构** — 统一所有存储函数的错误处理模式
- **剪切板 API** — 优先使用现代 `navigator.clipboard` API，降级到 `execCommand`
- **代码组织** — 从集中化模块导入常量，提升可维护性
- **构建脚本** — 将 `fullscreen/` 目录加入构建拷贝列表

### 安全

- **[严重] SQL 注入修复** — 在搜索查询中转义 LIKE 特殊字符（`\`、`%`、`_`）
- **[严重] XSS 防护** — 为 HTML 内容渲染添加 DOMPurify 清理机制

## [0.1.2] - 2026-03-10

### 新增

- **语法高亮** — 代码块使用 highlight.js 渲染，支持 30 种语言，适配浅色/深色主题
- **内容编辑** — 在详情弹窗中直接编辑文本内容
- **语言选择器** — 为每条缓存选择语法高亮语言
- **详情弹窗重构** — 顶部显示元信息，操作按钮（全屏、关闭）移至顶栏；底部显示复制和编辑按钮
- **设置页 About 区块** — 显示版本信息和 GitHub 链接
- **右键菜单** — 扩展图标右键菜单增加"设置"入口

### 修复

- **语法高亮不生效** — 构建脚本遗漏 `vendor/` 目录，导致 highlight.js 文件缺失

### 变更

- **右键菜单精简** — 移除"缓存剪切板"和"打开 ClipStash"菜单项
- **标签展示** — 标签文本超长时截断并显示 tooltip；无标签时隐藏标签区域
- **卡片代码预览** — 代码类型卡片显示语法高亮预览及语言标识
- **导入导出** — 数据中包含 `language` 字段
- **代码清理** — 移除未使用的国际化键值和冗余兜底代码

## [0.1.0] - 2026-03-03

### 新增

- **Popup 管理面板** — 点击插件图标打开
- **缓存剪切板按钮** — 一键缓存，支持成功、重复、空三种反馈
- **剪切板缓存** — 支持文本、图片、HTML 富文本
- **内容去重** — 相同内容不重复缓存
- **快捷键** — `Alt+Shift+C` 直接缓存剪切板，Badge 区分新增与重复
- **右键菜单** — 缓存剪切板、打开 ClipStash
- **缓存列表** — 缩略展示、相对时间、字符数统计
- **快捷复制** — 一键复制，显示"已复制 ✓"
- **全屏查看** — 模态弹窗 + 新标签页全屏展示
- **删除** — 单条删除（二次确认）、一键清空（无记录时置灰）
- **缓存上限** — 可配置 10 ~ 999（默认 100），失焦自动保存
- **标签系统** — 为每条缓存添加/移除标签
- **搜索过滤** — 实时搜索（250ms 防抖），快捷键聚焦
- **滚动加载** — 默认 12 条，滚动到底自动加载
- **统计信息** — 缓存数/上限、匹配数、已占用空间
- **置顶** — 常用缓存置顶，黄色左边框标识
- **导入导出** — 一键导出，导入自动去重并显示统计
- **设置面板** — 缓存上限、语言切换、数据区块
- **暗色主题** — 跟随系统 / 浅色 / 深色，即时切换
- **国际化** — 中英双语，即时切换
- **固定页头** — 标题栏、搜索栏、统计栏固定，列表独立滚动
- **卡片悬浮效果** — 上浮 + 加深阴影
- **GitHub 链接** — 页头 GitHub 图标按钮
- **特殊页面降级** — 特殊页面降级处理
- **Manifest V3** — 支持 Chrome 104+
- **零依赖** — 纯前端实现，零运行时依赖，零网络请求

[0.2.0]: https://github.com/lonsty/clipstash/releases/tag/v0.2.0
[0.1.3]: https://github.com/lonsty/clipstash/releases/tag/v0.1.3
[0.1.2]: https://github.com/lonsty/clipstash/releases/tag/v0.1.2
[0.1.0]: https://github.com/lonsty/clipstash/releases/tag/v0.1.0
