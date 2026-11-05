# 研究与导出参考

这些是一手资料入口。使用时按当前具体问题核对最新文档，不把文档片段复制成不必要的工具限制。

- [Khronos glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)：glTF 坐标是右手系、Y-up、长度以米计；GLB 有文件头、JSON chunk 和可选 BIN chunk。检查 4-byte 对齐、bufferView 范围、accessor 类型与 count、索引范围、POSITION min/max。
- [Three.js GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html)：`parseAsync(input, {binary:true})` 返回 ArrayBuffer；默认只导出可见对象，检查是否把临时剖切或隐藏状态带入导出。若导出动画，显式提供动画列表。
- [Blender glTF 2.0 导入导出](https://docs.blender.org/manual/en/4.2/addons/import_export/scene_gltf2.html)：检查材质节点支持、坐标转换、动画、UV 与纹理打包。此链接固定为 4.2；运行其他版本时切换到对应官方手册。不要自行再旋转一次导致重复轴向转换。
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator)：完整规范验证的主要工具。使用官方发行版或官方 npm 包；保留 JSON 报告，关注 error 与 warning 的实际意义。
- [Khronos glTF Sample Viewer](https://github.com/KhronosGroup/glTF-Sample-Viewer)：目标引擎显示异常时可进行独立渲染比较；不要把私有模型上传给未经用户指定的在线服务。

## 实际判断

2026-11-05 核对：[Khronos 的 extras 定义](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/extras.schema.json)允许应用自定义数据；[官方 Validator](https://github.com/KhronosGroup/glTF-Validator)针对 glTF 规范及其支持的扩展。`extras.heritageScene` 中的地面边界、入口和路径连通性需要额外契约校验，不能由官方 GLB 无错误报告推断通过。

嵌入 GLB 的 PBR 颜色足够表达轻量建筑；若贴图对真实性重要，检查 UV、sRGB/线性色彩空间、透明度和法线贴图方向。检查文件中所有 `images`、`buffers` 的外部 URI；导出 GLB 时仍可能有外链贴图。

验证优化前后的可见轮廓与材质，不能只看文件体积。首次交付优先使用不需要 Draco/KTX2 解码器的兼容格式；只有接收端明确支持时才加入压缩扩展。不要随意剔除地面下的台基、背面或屋檐内衬。

单张图片无法唯一确定背面、实际比例和被遮挡结构。搜索补充的同类资料应记录为补全依据，而不是伪装成该图直接提供的信息。游戏地图中的建筑位置可用来估计拓扑与前后关系，等轴插画不可直接按像素换算海拔。
