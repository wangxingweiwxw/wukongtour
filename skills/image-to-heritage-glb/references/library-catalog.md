# 内置资料与模型库

`assets/library/catalog.json` 保存项目 23 处古建筑资料、40 个已转换模型和 3 个原创通用示范；`models/` 是完整 GLB，`previews/` 是 40 张对应预览。所有路径相对 `catalog.json` 所在目录，复制整个技能后可离线查询和复用，不需应用仓库。

这不是“23 座已精确复原的古建”：资料站点、候选模型和通用示范分别记录。`sites[].source` 包含原资料的发布者、日期、标题与 URL；`evidence` 保留报道的证据强弱。`candidateAssetIds` 和 `matches` 只代表待考证或主题配置，`genericDemoAssetIds` 仅是风格示范。无对应模型的站点仍有完整资料，不能靠文件名为它认定模型。

## 挑选与使用

先按目标图辨明需要补足的是院墙、回廊、配殿、桥、塔还是近景陈设，然后查询形制合适的候选。查到结果后读完整条目、看预览和三维模型；确认尺度、朝向、材质与目标主题协调，再决定放置。不要把不同地区知名建筑随意堆入场景，也不要用角色道具增加建筑数量。

```text
node <skill>/scripts/catalog.mjs summary
node <skill>/scripts/catalog.mjs sites
node <skill>/scripts/catalog.mjs site 佛光寺
node <skill>/scripts/catalog.mjs search 黑风山
node <skill>/scripts/catalog.mjs search --category 场景部件 --use 院落围合
node <skill>/scripts/catalog.mjs asset asset-60863a416fd6
node <skill>/scripts/catalog.mjs verify
```

`search` 同时匹配名称、类别、用途标签与候选站点；`site` 展示资料来源与相关模型；`asset` 输出完整索引及当前机器上的实际路径；`verify` 核对全部 GLB/预览的字节数和 SHA-256。查询只需要 Node.js 22+ 的内置模块。

适合山寺群落的候选包括黑风山廊亭、黑风山钟楼、回廊、偏殿、围墙、石墙、枯井与转经筒。名称只提供检索线索，不证明文件就是官方游戏中的建筑。`usageTags` 是建模选材提示，不是历史结论；不合目标图的部件应舍弃。

## 尺度、通行与来源

- `bounds.min/max` 和 `size` 是经过节点变换后 GLB 的实际坐标范围；不是现实文物尺寸。使用门洞、人高和邻近主殿校准，避免库模型盖过主体。不要只按文件名推断朝向或高度。
- 模型内嵌几何和材质，预览 JPG 不会被当作模型贴图。体素风格模型保留轮廓，不提供原高精度贴图。
- 这些库模型没有可行走通行元数据。默认用作实体或背景；门洞、桥面和室内要有准确碰撞/地面才能对玩家开放。模型复用后的总 GLB 仍须重新校验并检查路线。
- `sha256`、`bytes`、顶点/三角面数、`bounds` 都来自实际文件；`validation` 区分基础结构检查与尚未执行的官方规范和外观检查。不得把文件校验通过当作历史身份或视觉质量通过。
- 资料来源快照保留原项目核对日期；实际任务应通过 agent 网络搜索核对影响建模的缺失信息，并在该任务的 `sources.md` 记录实际阅读的页面。没有打开过的目录 URL 不能写成“本次已核实”。
- `provenance` 保留用户模型源文件与转换说明；上游清单未声明许可的条目明确标记未知。原创示范与用户提供资源分开标识，不额外宣称官方资产来源或开放许可。

`pending` 仅记录一个尚未转换的“屋顶”MAX 资源，它没有 GLB 文件，不能作为已可用部件。将来更新库时应在维护项目运行同步脚本后重新打包；使用技能时不需要也不调用该维护脚本。
