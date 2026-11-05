# 雪山院落与图片建模技能

本次依据用户提供的小雷音寺地图，采用狭长中轴、两重山门、三层台地和两侧配殿的空间关系，重组原古建群。十三座建筑沿 96 × 144 米的可游玩区域布置，台地高程为 0、1.44、2.88 米，六组院落石阶的单级高为 0.18 米。主殿位于后院并扩大体量，辅以两侧经廊、亭阁和塔。

参考图是插画式地图，没有测绘比例、完整室内与背面。本次建筑尺寸、斗拱、构件、门洞、名称和部分支路是服务于玩法的原创补全；未提取或嵌入官方游戏网格，也不宣称与游戏地图逐栋精确一致。

## GLB 契约

使用标准 glTF 2.0 二进制容器，米制、右手系、Y-up。建筑为独立命名节点，屋顶可单独显隐；中文牌匾贴图与几何均嵌入文件。导出不会携带临时隐藏屋顶、引导标记和悬浮名称。

可选 `root.extras.heritageScene` 保存通行边界、出生点、实墙/柱碰撞、地面高度、建筑与屋顶引用、门口/室内点和导览点。普通 GLB 查看器可以忽略此字段；接入漫游的应用需实现相应契约。完整字段见技能的 `references/layout-schema.md`。本项目额外检查引用唯一性、有限坐标、范围与路线连通，并在导入后恢复阴影。

## 独立复用

`skills/image-to-heritage-glb/assets/ancient-compound.glb` 是本次项目群落的可导入参考快照。
`assets/mountain-temple-layout.json` 是相同院落布局的独立生成器模板，采用曲面屋顶、参数化柱梁与简化亭塔；几何细节与参考快照不同。

技能的生成器和基础校验只使用 Node.js 标准库，离线可用；预览器通过固定版本 Three.js CDN 渲染，因此预览需要联网。技能指示 agent 按任务搜索一手资料，模型生成本身不依赖网络服务或账号。

## 研究依据（2026-11-05）

- [Khronos glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)：单位、坐标、GLB 结构与资源内嵌检查。
- [Three.js GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html)：二进制导出和可见性行为。
- [Blender 4.2 glTF 导出](https://docs.blender.org/manual/en/4.2/addons/import_export/scene_gltf2.html)：材质与坐标导出工作流，供复杂模型扩展使用；本次未依赖 Blender。
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator)：独立规范校验。

验证覆盖实际角色控制器的全部导览路线、主殿穿堂、侧门、台阶、GLB 往返加载以及错误元数据拒绝；另外安排独立 agent 仅阅读技能，在项目外完成五建筑模型生成，验证其无项目依赖。
