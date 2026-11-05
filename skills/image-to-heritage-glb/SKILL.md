---
name: image-to-heritage-glb
description: 根据古建筑照片、游戏地图或概念图生成可导入的自包含 GLB；结合小雷音寺完整群落基准、23处古建资料、43个库内模型与网络研究，重建建筑、院落、地形和植被。
---

# 图片到古建筑 GLB

把用户图片转为可编辑的建筑参数与真实三维网格，交付单文件 GLB、参数 JSON、校验报告和预览。图片由 agent 观察理解，脚本根据参数建模；不是从图片自动恢复真实尺寸的摄影测量工具。

本技能可独立复制到任何目录。导出与基础校验只需要 Node.js 22 或更新版本，不引用任何应用仓库，不依赖 npm 包、Blender、私有 API 或固定磁盘路径。以本 `SKILL.md` 所在目录为 `<skill>`，所有输出写到用户任务目录 `<out>`，不要改写内置基准。

## 先读图，再确定模型

查看每张参考图，并区分照片、游戏截图、等轴地图、正交图。记录建筑数量、主次体量、轴线、前后顺序、院墙缺口、台地高差、阶梯连接及配色。等轴投影中的屏幕竖向距离不是建筑高度；先用共用屋脊、平行院墙与阶梯判断地面轴。

把可见结构与补全假设写到 `<out>/image-analysis.md`：例如“正面可见三开间；背面未显示，采用对称开间”。尺寸未知时给出一致的米制估计，使用门高、柱高和人的尺度作参照，不能宣称测绘精度。重要模糊处才询问用户，其他处先做合理补全。

## 实际分析完整基准

内置 [ancient-compound.glb](assets/ancient-compound.glb) 是项目实际使用的“小雷音寺 · 雪山院落”原创群落完整导出：13 座建筑、三层台地、围墙、侧廊、树石山势、内嵌中文牌匾及通行元数据。它不是官方游戏资产，也不是所有图片的固定模板。[baseline.json](assets/baseline.json) 记录文件哈希、统计与来源；[mountain-temple-layout.json](assets/mountain-temple-layout.json) 只是独立生成器的简化参数近似，**不能代替完整 GLB 的细节和景观参考**。

开始群落建模前，读取 baseline.json，实际分析完整 GLB 的节点、米制尺寸和布局，并打开预览观察院落与景观层次。运行以下命令；模型尚未生成时可省略 `--model`，用于提前检查布局：

```text
node <skill>/scripts/analyze_scene.mjs --layout <out>/layout.json --report <out>/scene-review.json
node <skill>/scripts/preview.mjs --model <skill>/assets/ancient-compound.glb --port 5190
```

工具同时对比真实基准与简化模板。预览不可用时先查看随包的 [baseline-preview.png](assets/baseline-preview.png)，继续分析真实 GLB 并明确实时三维检查的限制。根据 [scene-composition.md](references/scene-composition.md) 在 `<out>/design-decisions.md` 写清采用的尺度、主次体量、门前缓冲、围合、台地连接、近中远景做法，以及与本图不符而舍弃的部分。不得只写“已参考示例”或仅列文件名。山林地图的树木、岩壁、坡岸和溪桥属于场景主体关系；不能因基础模板未包含就全部省略，也不能用一块巨大平板和几座孤立房子宣称完成整幅场景。

## 研究与建模选择

使用当前 agent 可用的网络搜索能力补足影响建模的具体信息。建筑形制优先找遗产管理机构、博物馆或官方资料；GLB 导出问题优先查 Khronos、Blender、Three.js 文档。将实际查阅的 URL、日期与采用的结论记录到 `<out>/sources.md`。无需依赖特定搜索插件或 API key。

先看 [research-and-export.md](references/research-and-export.md)。联网可用时，在确定布局前实际查阅影响当前建筑与景观的资料：比如山门与侧院关系、屋顶类型、依山台地、石塔或桥的形制。即使游戏建筑没有已确认的文物原型，也应研究同类建筑，明确标为补全参照，不能以“游戏原创”或“导出没报错”为由跳过建筑研究。优先管理机构、博物馆、文保资料及官方游戏图像；游戏攻略只可补充定位线索，不作为测绘证据。记录“问题 → 实际打开的来源 → 采用/不采用的建模决定”，不能只堆搜索结果链接。无需为每个模型重复查询已解决的同类问题。离线时继续用内置参考，标记研究未完成及受影响的假设，不编造来源。

- **一般游戏用古建或地图群落**：按 [layout-schema.md](references/layout-schema.md) 编写 `layout.json`，使用内置参数化网格生成器。它适合有真实屋顶曲面、柱梁、门洞和台阶的轻量模型。
- **用户要求复杂雕塑、严格形制或高保真纹理**：基准只用于结构对照；检查当前环境是否有 Blender 或可用 3D 工具，按官方文档完善网格或材质再导出。不可把二维图片贴在平面上冒充可绕行模型，不声称未使用的外部生成服务。追加收费服务须在使用前明确所需授权。

## 从内置资料与模型库选择补充

读取 [library-catalog.md](references/library-catalog.md)，使用 `scripts/catalog.mjs` 查询 [library/catalog.json](assets/library/catalog.json)。其中保存 23 处古建资料、40 个已转换候选模型、3 个原创通用古建示范、来源、预览、文件哈希与实际尺寸。模型文件已随技能内置；不需要原项目、原 FBX/MAX 或在线模型服务。未转换 MAX 只保留记录，不能作为可用 GLB 选择。

按图片所需形制、时期、材质和用途检索，打开候选预览并检查尺度；选择相符的廊亭、钟楼、墙体或陈设用于侧院、转折和远景。主题命名和站点候选关系不证明真实建筑身份，也不应把外观不符的模型硬塞进场景。把所选 assetId、位置、缩放、用途、采用/排除原因写到 `design-decisions.md`。复用不是必须数量指标，找不到合适模型时说明理由并建模补全。

按照 [layout-schema.md](references/layout-schema.md#bundled-library-instances) 的 `libraryInstances` 接口将所选模型真正合并到输出 GLB；不能只在报告列模型名或写外部链接。无通行元数据的库模型用 solid 包围盒作为不可进入的陈设，不能替换必经山门、桥面或可入内主殿；这种部位继续用真实门洞/地面契约建模。保留原模型来源与身份说明。

## 生成、校验与观察

从 [example-layout.json](assets/example-layout.json) 的三建筑参数起步，或使用 [mountain-temple-layout.json](assets/mountain-temple-layout.json) 的十三建筑、三层台地模板，按图片调整。山林场景可参考 [forest-compound-layout.json](assets/forest-compound-layout.json) 的树石围合和库模型补充方式。与图不符的默认建筑应删除或修改，不照搬整个示例；模板是起点，不是视觉完成的标准。

```text
node <skill>/scripts/build_glb.mjs --spec <out>/layout.json --out <out>/architecture.glb --report <out>/build-report.json
node <skill>/scripts/validate_glb.mjs <out>/architecture.glb --report <out>/validation.json
node <skill>/scripts/analyze_scene.mjs --layout <out>/layout.json --model <out>/architecture.glb --report <out>/scene-review.json
```

构建报告需要检查尺寸、顶点/三角面数、材质数、节点名称和警告。GLB 采用 glTF 2.0、米、右手系、Y 向上，模型正面约定为 +Z；几何、颜色与所用贴图必须在同一文件内。GLB 文件扩展名本身不保证没有外部依赖。

构建器在写入 GLB 前执行校验；失败时不发布新模型。使用 `--report` 时，失败退出也会把本次报告写成 `ok:false`，避免误读上次的成功报告。校验失败后先修正布局，再重新生成并校验最终文件，不要只修改报告或删除通行声明绕过错误。

基础校验、通行契约与目标端验证是不同结果。读取报告中的 `validation`：存在通行声明时，`heritageContract` 和 `connectivity` 都必须为 `passed`；没有声明的普通模型不能宣称可入内漫游。核对报告 SHA-256 与最终交付文件，区分旧版和修复版。完整 glTF 规范仍需官方 glTF Validator；它不负责验证应用自定义的 `extras.heritageScene`。不能把基础通过写成官方或目标端通过。

加载模型检查正面、斜侧、背面与俯瞰至少四个方向，再从人眼高度检查主游路的入口、转折和终点。将 `scene-review.json` 的长空白路段、主次比例、围合/植被缺项与参考图逐项核对；不能把三角数、单一覆盖率或 GLB 技术通过当成“不空旷”的证明。保留合理庭院留白，补足图片实际可见的环境层次后再交付。也检查屋檐厚度、法线、门洞、柱梁连接、台阶落地、库模型尺度、遮挡和道路净宽。优先使用目标导入器。独立预览可运行：

```text
node <skill>/scripts/preview.mjs --model <out>/architecture.glb --port 5190
```

预览器提供四个外观方向；有通行元数据时，还可用“游路视角”逐个查看出生点和导览点的1.65m人眼高度。此按钮切换静态视点，不模拟行走。预览器使用已锁定版本的 Three.js 公共 CDN，需要联网；若目标环境离线，用已有本地 GLB 查看器或 Blender，导出器与基础校验不需要联网。不要为预览把用户私有图片上传到第三方服务。

## 群落通行

普通 GLB 本身不描述玩家碰撞。只有需要可行走群落时生成 `extras.heritageScene`：它是本技能的可选、公开 JSON 契约，不是 glTF 标准扩展。字段在 [layout-schema.md](references/layout-schema.md) 中说明；不识别它的查看器仍可显示标准网格。

台阶高度应小于接收端的步高限制，平台面和视觉高度一致；碰撞只覆盖实墙与柱，不能以整座建筑包围盒堵住门洞。群落元数据须与最终节点、位置及导览点一致。手写 `walk.bounds` 时，要包含**完整地面矩形、台基、台阶和室内范围**，不能只包住建筑中心、出生点与导览点。越界报错先核对对应对象尺寸及边界：按场地意图扩大通行区或修正真实地面尺寸，不裁掉导航数据来掩盖错误。

随技能的独立校验器检查完整 v1 契约及参考控制器的路径：出生点到各建筑入口、入口与室内/侧门双向、导览点按序连通。参考控制器不依赖应用仓库，规则与范围见 [layout-schema.md](references/layout-schema.md#walkable-glb-metadata)。路径存在仍不能证明网格与碰撞完全重合；目标导入器可用时还须实际加载与通行。目标端不可用时标记“参考契约与路径检查通过，目标端尚未实测”，不要宣称目标端验证通过。

## 交付

给出 GLB 下载路径、参数文件、校验结果、scene-review、design-decisions、sources 与截图。说明忠实取自图片的部分、推定的不可见部分以及未实现的细节。说明完整基准的具体借鉴、实际复用的库模型和网络研究带来的改变；未做的核对如实标注。若进行了拓扑或贴图升级，说明使用的工具和实际验证结果。单次任务不默认修改任意应用仓库或发布线上站点；只有用户要求集成时再按该应用接口处理。
