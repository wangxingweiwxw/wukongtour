// Curated public-source inventory. Coordinates are authored district/county approximations,
// NOT surveyed entrances. Evidence does not imply a complete building was scanned.
export const atlasMeta = {
  checkedAt: '2026-11-02',
  scope: '公开报道支持的代表地点，非游戏官方完整资产目录',
  coordinateNote: '点位为区县 / 地区级近似位置；近邻点分开展示，不可用于实地导航。',
};
export const sources = {
  beijing:{publisher:'京报网',date:'2024-08-21',title:'《黑神话：悟空》中的山西建筑古迹',url:'https://news.bjd.com.cn/2024/08/21/10873892.shtml'},
  hangzhou:{publisher:'杭州网',date:'2024-08-31',title:'《悟空 不止是神话》· 建筑景观',url:'https://z.hangzhou.com.cn/2024/wukong/content/content_8834292.html'},
  xinhua: {publisher:'新华社', date:'2024-08-22',title:'《黑神话：悟空》火了！中国古建“出圈”了！',url:'https://www.xinhuanet.com/20240822/f7de3658396c46248ccbc3de770756ee/c.html'},
  jincheng:{publisher:'晋城市人民政府',date:'2024-10-19',title:'瞧！藏在晋城的秘密都在这里！',url:'https://www.jcgov.gov.cn/dtxx/ztzl/2018nzt/jcwmw/zxtp/202410/t20241019_2050400.shtml'},
  gaoping:{publisher:'高平市人民政府 · 转人民日报',date:'2024-08-21',title:'高平铁佛寺火出圈',url:'https://www.sxgp.gov.cn/xwzx_358/jcdt_363/202408/t20240821_2023289.shtml'},
  paper:{publisher:'澎湃新闻',date:'2024-08-21',title:'原画场景 VS 取景实地',url:'https://www.thepaper.cn/newsDetail_forward_28478378'},
  zhejiang:{publisher:'浙江省风景名胜区协会',date:null,title:'《黑神话：悟空》中的浙江取景地',url:'https://ppaz.com.cn/newsinfo/8149037.html'},
  archive:{publisher:'浙江在线 · 来源浙江省档案馆',date:'2025-06-04',title:'在景宁，竟藏着《黑神话：悟空》的取景地',url:'https://cs.zjol.com.cn/zt/qtdas/shengyin/sydag/202506/t20250604_31034627.shtml'},
  quanzhou:{publisher:'泉州市人民政府 · 泉州晚报',date:'2024-09-06',title:'这两条旅游路线留下“悟空”足迹',url:'https://www.quanzhou.gov.cn/lyb/lyxw/202409/t20240925_3084650.htm'},
  sichuan:{publisher:'四川日报',date:'2026-08-14',title:'千年茗山寺焕新亮相',url:'https://epaper.scdaily.cn/shtml/scrb/20260814/1086895.html'},
  shandong:{publisher:'山东宣传网',date:'2024-09-05',title:'“悟空”带火古建筑，山东家底了解下',url:'https://www.sdxc.gov.cn/whql/whcc/202409/t20240905_14758288.htm'},
  shaanxi:{publisher:'华商报 · 现场采访文管所',date:'2024-08-23',title:'探访《黑神话：悟空》取景地水陆庵',url:'https://hsb.hspress.net/system/2024/0823/222785.shtml'},
  tianjin:{publisher:'新华社',date:'2024-11-04',title:'独乐寺与游戏文化传播报道',url:'https://www.xinhuanet.com/ci/20241104/e94a177dbea54bad95818d126b23ee84/c.html'},
};
// id, name, province, locality, lon, lat, category, feature, relationship, evidence, source, demoIndex
const rows = [
 ['foguang','佛光寺','山西','忻州 · 五台县',113.25,38.73,'寺庙','东大殿、经幢与彩塑','建筑及文物素材','新华社明确提及佛光寺木构与文物元素进入游戏。','xinhua',0],
 ['yingxian','应县木塔','山西','朔州 · 应县',113.19,39.55,'古塔','高层木构与层叠出檐','取景报道','新华社将应县木塔列入游戏中呈现的古建。','xinhua',1],
 ['xiaoxitian','小西天（千佛庵）','山西','临汾 · 隰县',110.94,36.69,'彩塑','殿内悬塑群','造像 / 装饰素材','新华社明确提到小西天悬塑；不等于整座寺院原样搬入游戏。','xinhua'],
 ['yuhuang','泽州玉皇庙','山西','晋城 · 泽州县',112.85,35.50,'彩塑','二十八星宿、亢金龙彩塑','角色造型参考','新华社明确指出亢金龙形象来自这里的二十八星宿彩塑。','xinhua'],
 ['tiefo','高平铁佛寺','山西','晋城 · 高平市',112.92,35.80,'彩塑','寺内彩塑造像','造像 / 装饰素材','当地政府报道展示游戏与铁佛寺画面对照。','gaoping'],
 ['yungang','云冈石窟','山西','大同 · 云冈区',113.14,40.06,'石窟石刻','石窟与佛教造像','取景报道','新华社将云冈石窟列入游戏古建、造像素材相关地点。','xinhua'],
 ['chongfu','崇福寺','山西','朔州 · 朔城区',112.43,39.32,'寺庙','殿宇木构','取景报道','新华社将崇福寺列入游戏呈现的山西古建。','xinhua'],
 ['qinglian','青莲寺','山西','晋城 · 泽州县',112.90,35.45,'寺庙','寺院殿宇与造像','取景报道','高平市政府转载报道将青莲寺列入取景参考地点。','gaoping'],
 ['xixi','西溪二仙庙','山西','晋城 · 陵川县',113.28,35.78,'寺庙','庙宇木构、二仙信仰','取景报道','晋城市政府明确称西溪二仙庙为游戏取景地之一。','jincheng'],
 ['shuanglin','双林寺','山西','晋中 · 平遥县',112.18,37.19,'彩塑','寺院彩塑','取景报道','高平市政府转载报道将双林寺称为游戏取景地。','gaoping'],
 ['nanchan','南禅寺','山西','忻州 · 五台县',113.24,38.65,'寺庙','古寺木构','媒体画面对照','澎湃新闻援引文旅视频与古建爱好者辨识；暂不作开发商逐项确认。','paper'],
 ['jinge','金阁寺','山西','忻州 · 五台山地区',113.59,39.00,'寺庙','寺院建筑','媒体画面对照','澎湃新闻在文旅视频取景地比对中列出金阁寺。','paper'],
 ['xuankong','悬空寺','山西','大同 · 浑源县',113.70,39.70,'寺庙','峭壁上的木构寺院','建筑场景取景','京报网将游戏场景与恒山悬空寺作直接画面对照。','beijing'],
 ['guangsheng','广胜寺飞虹塔','山西','临汾 · 洪洞县',111.67,36.25,'古塔','琉璃塔与层叠塔檐','取景报道','杭州网游戏专题将广胜寺飞虹塔列为游戏古建素材。','hangzhou'],
 ['dule','独乐寺','天津','蓟州区',117.41,40.04,'寺庙','观音阁、山门木构','场景取景报道','新华社报道将独乐寺与游戏中的亢金龙场景联系起来。','tianjin',2],
 ['shisi','时思寺','浙江','丽水 · 景宁畲族自治县',119.64,27.98,'寺庙','古寺木构与院落','实景建模报道','浙江省档案馆来源的报道明确提及实景三维建模及游戏画面对照。','archive'],
 ['feilaifeng','灵隐飞来峰造像','浙江','杭州 · 西湖区',120.10,30.24,'石窟石刻','金刚手菩萨等石刻','实景扫描 / 造像素材','浙江省风景名胜区协会明确提及团队扫描相关石刻；未据此认定整座灵隐寺复刻。','zhejiang'],
 ['kaiyuan','开元寺东西塔','福建','泉州 · 鲤城区',118.59,24.91,'古塔','镇国塔、仁寿塔','建筑场景取景','泉州市政府报道明确提到游戏出现东西塔。文旅线路中的清净寺、清源山不据此纳入。','quanzhou'],
 ['dazu','大足石刻','重庆','大足区',105.72,29.71,'石窟石刻','摩崖造像与石刻群','实景扫描报道','新华社明确提及大足石刻参与游戏实景扫描。','xinhua'],
 ['mingshan','茗山寺造像','四川','资阳 · 安岳县',105.34,30.10,'石窟石刻','毗卢遮那佛等宋代造像','造像场景蓝本','四川日报现场报道指出游戏采用毗卢遮那佛站立造像作为场景蓝本。','sichuan'],
 ['shuilu','水陆庵','陕西','西安 · 蓝田县',109.32,34.15,'彩塑','殿内壁塑与横三世佛','文管所采访','华商报记者采访文管所，取景涉及正面佛像和北山墙壁塑。','shaanxi'],
 ['lingyan','灵岩寺','山东','济南 · 长清区',116.75,36.55,'寺庙','寺院古建与塔林','取景报道','山东宣传网明确列出游戏中出现的灵岩寺。','shandong'],
 ['simen','四门塔','山东','济南 · 历城区',117.07,36.48,'古塔','石塔建筑','取景报道','山东宣传网明确列出游戏中出现的四门塔；不与灵岩寺混为一处。','shandong'],
];
export const heritageSites = rows.map(([id,name,province,locality,lon,lat,category,feature,relationship,evidence,source,demoIndex])=>({id,name,province,locality,lon,lat,category,feature,relationship,evidence,source,demoIndex,coordinatePrecision:'地区近似点',modelStatus:demoIndex===undefined?'待制作对应模型':'仅有通用风格化示范'}));
