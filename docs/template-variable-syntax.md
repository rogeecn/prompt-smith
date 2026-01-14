# 制品变量占位符语法规范

## 1. 语法格式

```
{{key|label:字段名|type:string|default:默认值|placeholder:输入提示|required:true}}
```

- `key`：变量名，必须匹配正则 `^[A-Za-z][A-Za-z0-9_]*$`
- 变量之间用 `|` 分隔
- `label` 与 `type` 为必填字段
- `enum` 类型必须提供 `options`

## 2. 字段定义

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `label` | 是 | 表单字段展示名称 |
| `type` | 是 | 类型：`string` / `text` / `number` / `boolean` / `enum` / `list` |
| `required` | 否 | 是否必填，`true/false` |
| `default` | 否 | 默认值 |
| `placeholder` | 否 | 表单输入提示 |
| `options` | enum 必填 | 枚举选项，使用逗号分隔 |
| `joiner` | 否 | list 输出拼接符（默认 `、`） |
| `true_label` | 否 | boolean 为 true 时的展示文本 |
| `false_label` | 否 | boolean 为 false 时的展示文本 |

## 3. 示例

### 3.1 基础字符串

```
{{topic|label:主题|type:string|default:职场穿搭|placeholder:例如 通勤/面试/客户会议|required:true}}
```

### 3.2 枚举

```
{{tone|label:语气|type:enum|options:专业,亲切,幽默|default:亲切}}
```

### 3.3 列表

```
{{tags|label:关键词|type:list|default:通勤,显高,极简|joiner:、}}
```

### 3.4 布尔

```
{{include_examples|label:是否包含示例|type:boolean|default:true|true_label:包含|false_label:不包含}}
```

### 3.5 示例模板

```
你是一位小红书内容编辑，请生成一篇主题为 {{topic|label:主题|type:string|default:职场穿搭}} 的帖子。
受众为 {{audience|label:受众画像|type:string|default:通勤上班族女生}}，
语气为 {{tone|label:语气|type:enum|options:专业,亲切,幽默|default:亲切}}。

输出结构：
1) 标题：给出 {{title_count|label:标题数量|type:enum|options:3,5,8|default:5}} 个标题
2) 正文：包含清单与步骤
3) 结尾：加入话题标签 {{hashtag_count|label:话题数量|type:enum|options:5,8,10,12|default:10}}
```

## 4. 注意事项

- 同一模板中变量名必须唯一
- 如需输出字面量 `{{`，请使用转义：`\\{{`
