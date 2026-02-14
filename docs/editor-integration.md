# Editor.md 工具栏修复经验总结

## 问题描述

Editor.md 工具栏图标显示为灰色方块，且点击后功能不生效。

## 问题根因

Editor.md 1.5.0 内置的按钮名称与常用名称不一致，导致：
1. `toolbarIconsClass` 映射不匹配
2. `toolbarHandlers` 无法正确绑定处理函数

## 修复方案

### 1. 按钮名称映射

| 功能 | 错误名称 | 正确名称 |
|------|----------|----------|
| 加粗 | `bold` | `bold` ✓ |
| 斜体 | `italic` | `italic` ✓ |
| 删除线 | `strikethrough` | `del` |
| 无序列表 | `list` | `list-ul` |
| 有序列表 | `ordered-list` | `list-ol` |
| 代码块 | `code-block` | `code` |

### 2. 图标类名映射

Editor.md 使用 Font Awesome 图标，但部分按钮需要特定类名：

```javascript
toolbarIconsClass: {
    'bold': 'fa-bold',
    'italic': 'fa-italic',
    'del': 'fa-strikethrough',
    'h1': 'editormd-bold',    // 使用 editormd 内置类名
    'h2': 'editormd-bold',
    'h3': 'editormd-bold',
    'h4': 'editormd-bold',
    'h5': 'editormd-bold',
    'h6': 'editormd-bold',
    'list-ul': 'fa-list-ul',
    'list-ol': 'fa-list-ol',
    'quote': 'fa-quote-left',
    'code': 'fa-code',
    'link': 'fa-link',
    'image': 'fa-image',
    'table': 'fa-table',
    'preview': 'fa-eye',
    'fullscreen': 'fa-expand',
    'datetime': 'fa-clock'
}
```

### 3. 显式绑定处理函数

由于自定义按钮列表，需要添加 `toolbarHandlers` 配置：

```javascript
toolbarHandlers: {
    'bold': function() { this.bold(); },
    'italic': function() { this.italic(); },
    'del': function() { this.strikethrough(); },
    'h1': function() { this.headers(1); },
    'h2': function() { this.headers(2); },
    // ... 其他按钮
    'list-ul': function() { this.list('ul'); },
    'list-ol': function() { this.list('ol'); },
    'quote': function() { this.blockquote(); },
    'code': function() { this.codeBlock(); },
    'link': function() { this.link(); },
    'image': function() { this.image(); },
    'table': function() { this.table(); },
    'preview': function() { this.preview(); },
    'fullscreen': function() { this.fullscreen(); }
}
```

## Editor.md 默认按钮名称参考

从 `editormd.min.js` 提取的默认映射：

```javascript
toolbarIconsClass: {
    undo: "fa-undo",
    redo: "fa-repeat",
    bold: "fa-bold",
    del: "fa-strikethrough",        // 删除线
    italic: "fa-italic",
    quote: "fa-quote-left",
    h1-h6: "editormd-bold",
    "list-ul": "fa-list-ul",        // 无序列表
    "list-ol": "fa-list-ol",        // 有序列表
    link: "fa-link",
    image: "fa-picture-o",
    code: "fa-code",
    "code-block": "fa-file-code-o",
    table: "fa-table",
    preview: "fa-desktop",
    fullscreen: "fa-arrows-alt"
}
```

## 关键教训

1. **使用内置按钮名**: Editor.md 的按钮名称是预定义的，不能随意命名
2. **查阅源码**: 遇到问题时查看 `editormd.min.js` 获取准确的配置
3. **自定义按钮需要处理器**: 覆盖默认 `toolbarIcons` 时，必须同时配置 `toolbarHandlers`
