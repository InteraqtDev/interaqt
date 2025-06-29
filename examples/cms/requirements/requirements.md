## 背景
需要一套可以让产品运营人员管理在线管理预置数据的后台操作界面。
## 需求
1. 需要管理的数据结构见下方 Style 对象数据结构表格。
3. 支持拖拽排序。
4. 支持发布版本管理、回滚。
### 需要管理的 Style 对象数据结构
字段	类型	手动/自动填写	描述
id	uuid	自动	
label	text	手动	前端展示用名称（如 “Manga”）
slug	text	手动	唯一、URL-safe（如 manga），对应旧代码里的 value
description	text	手动	
type	varchar(32)	手动	“animation / surreal / …”
thumb_key	text	s3 上的地址
priority	int	手动	前端排序，同旧逻辑
status	varchar(16)	手动	draft / published / offline
created_at	timestamptz	自动	默认 now()
updated_at	timestamptz	自动	