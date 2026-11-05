# 研究与导出参考

这些是一手资料入口。使用时按当前具体问题核对最新文档，不把文档片段复制成不必要的工具限制。

## 建筑与场景研究

先从 [23处资料索引](../assets/library/catalog.json) 找同类实例，再使用 agent 当前的搜索/浏览工具核对原文。无需特定插件、账号或搜索 API；不能只搜索 GLB 技术而不研究当前图片里的建筑。写入任务 `sources.md` 的最小记录为：检索问题、URL、发布机构、访问日期、实际读到的结论、采用的位置、证据限制。查不到确切原型时，用同类实例解释补全部分；不得把类比来源写成黑神话官方布局依据。

2026-11-05 实际核对的示例：

- [北京市文物局 / 大觉寺：寺庙建筑布局和艺术](https://wwj.beijing.gov.cn/bjww/wwjzzcslm/1731063/1731066/djs/1731072/1731295/index.html)：寺院由主轴殿堂、跨院和园林共同组织，建筑随山势递升，并结合树木和叠石。可据此研究主次空间、台地过渡与景观围合，不能据此确定游戏内黑风山的具体位置或尺寸。
- [高平市政府：定林寺建筑介绍](https://www.sxgp.gov.cn/xwzx_358/wjsd_1324/202505/t20250502_2137872.shtml)：该页标明来源人民网，介绍山门重檐与钟鼓楼关系、檐角和柱梁细节。适合提出进一步的形制检索问题；精确复原应继续找文保测绘或管理机构资料。
- [游戏科学官网](https://www.heishenhua.com/)：可用于寻找官方图像入口。此次文本抓取未取得黑风山详细地图数据，不能声称已从该站验证了游戏关卡尺寸或建筑身份。用户地图仍是空间拓扑的直接参考。

先确定图片支持的结构，再将研究结论映射到具体元素：例如“保留图上双塔/造像位置，不确定的形制单独列出；根据同类山寺资料为门楼旁补小尺度配景，而不凭名称新增整条中轴”。网络研究应改变可说明的建模决定，而不是装饰性的来源清单。

## 导出技术

- [Khronos glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)：glTF 坐标是右手系、Y-up、长度以米计；GLB 有文件头、JSON chunk 和可选 BIN chunk。检查 4-byte 对齐、bufferView 范围、accessor 类型与 count、索引范围、POSITION min/max。
- [Three.js GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html)：`parseAsync(input, {binary:true})` 返回 ArrayBuffer；默认只导出可见对象，检查是否把临时剖切或隐藏状态带入导出。若导出动画，显式提供动画列表。
- [Blender glTF 2.0 导入导出](https://docs.blender.org/manual/en/4.2/addons/import_export/scene_gltf2.html)：检查材质节点支持、坐标转换、动画、UV 与纹理打包。此链接固定为 4.2；运行其他版本时切换到对应官方手册。不要自行再旋转一次导致重复轴向转换。
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator)：完整规范验证的主要工具。使用官方发行版或官方 npm 包；保留 JSON 报告，关注 error 与 warning 的实际意义。
- [Khronos glTF Sample Viewer](https://github.com/KhronosGroup/glTF-Sample-Viewer)：目标引擎显示异常时可进行独立渲染比较；不要把私有模型上传给未经用户指定的在线服务。
- [glTF Transform mergeDocuments](https://gltf-transform.dev/modules/functions/functions/mergeDocuments)：官方工具文档说明合并文档后仍需处理场景与 Buffer。技能内置合并器使用独立 Node 实现并限制支持范围；对复杂外部模型使用其他工具时同样检查索引重映射、资源内嵌与场景根节点，不能简单拼接二进制文件。

## 实际判断

2026-11-05 核对：[Khronos 的 extras 定义](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/extras.schema.json)允许应用自定义数据；[官方 Validator](https://github.com/KhronosGroup/glTF-Validator)针对 glTF 规范及其支持的扩展。`extras.heritageScene` 中的地面边界、入口和路径连通性需要额外契约校验，不能由官方 GLB 无错误报告推断通过。

嵌入 GLB 的 PBR 颜色足够表达轻量建筑；若贴图对真实性重要，检查 UV、sRGB/线性色彩空间、透明度和法线贴图方向。检查文件中所有 `images`、`buffers` 的外部 URI；导出 GLB 时仍可能有外链贴图。

验证优化前后的可见轮廓与材质，不能只看文件体积。首次交付优先使用不需要 Draco/KTX2 解码器的兼容格式；只有接收端明确支持时才加入压缩扩展。不要随意剔除地面下的台基、背面或屋檐内衬。

单张图片无法唯一确定背面、实际比例和被遮挡结构。搜索补充的同类资料应记录为补全依据，而不是伪装成该图直接提供的信息。游戏地图中的建筑位置可用来估计拓扑与前后关系，等轴插画不可直接按像素换算海拔。
