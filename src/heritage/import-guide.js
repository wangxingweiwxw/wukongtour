import './import-guide.css';

const SKILL_PROMPT = '使用 $image-to-heritage-glb，根据我提供的古建筑照片或地图生成自包含 GLB。先分析建筑形制与院落布局，参考内置古建群，搜索一手资料补足细节。附布局 JSON、校验报告和多角度预览；需要入内漫游时，输出 extras.heritageScene 通行元数据，并验证门洞、台阶和导览路线。';

/** A local-file guide: model generation happens in the user's agent. */
export function createImportGuide({triggers, fileInput, clearInput}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'importGuide';
  dialog.setAttribute('aria-labelledby', 'importGuideTitle');
  dialog.innerHTML = `
    <div class="import-guide-head">
      <div><span class="import-guide-kicker">古建工坊 · 从图片到三维</span><h2 id="importGuideTitle" tabindex="-1">把古建，带入山河</h2><p>先了解生成技能与模型规范，再选择你的 GLB 文件。</p></div>
      <button type="button" id="closeImportGuide" aria-label="关闭导入指南">×</button>
    </div>
    <div class="import-guide-body">
      <div class="import-guide-intro">
        <section class="import-skill-card" aria-labelledby="importSkillTitle">
          <span class="import-guide-number">01 / 生成技能</span>
          <h3 id="importSkillTitle">一张参考图，<br>一座可探索的古建。</h3>
          <code class="import-skill-name">image-to-heritage-glb</code>
          <p>让 agent 读懂古建筑照片、游戏地图或概念图，分析屋顶、柱梁、门洞与院落关系，再生成真正的三维网格。</p>
          <ul><li>支持单体古建与多院落建筑群</li><li>内置原创古建群 GLB，供尺度与结构对照</li><li>调用 agent 网络搜索，参考建筑与导出资料</li><li>独立运行，建模与基础校验仅需 Node.js 22+</li></ul>
          <a class="import-skill-download" href="/downloads/image-to-heritage-glb.zip" download>下载技能安装包 <span>ZIP · 3.5 MiB ↓</span></a>
          <p class="import-skill-note">模型由你的 agent 生成。本页负责导入；单张图片未展示的背面与尺寸，需要合理补全。</p>
        </section>
        <section class="import-steps" aria-labelledby="importStepsTitle">
          <span class="import-guide-number">02 / 导入方法</span>
          <h3 id="importStepsTitle">从参考图到场景，只需三步</h3>
          <ol>
            <li><strong>安装技能，提供参考图</strong><p>解压安装包，将完整的 <code>image-to-heritage-glb</code> 目录交给你的 agent 安装。保留其中的脚本、文档与参考模型。</p></li>
            <li><strong>生成并检查 GLB</strong><p>让 agent 根据图片建模，交付 <code>.glb</code>、布局 JSON、校验报告和预览。需要进入殿堂时，要求生成通行元数据。</p><button type="button" class="import-copy" id="copyImportPrompt">复制技能调用示例</button></li>
            <li><strong>选择文件，进入场景</strong><p>点击下方“选择 GLB 文件”。普通模型进入预览庭院；通过校验的古建群直接进入漫游模式。</p></li>
          </ol>
          <details class="import-example"><summary>查看技能调用示例</summary><p id="importPromptText"></p></details>
          <div class="import-local-note"><strong>文件只在当前浏览器中读取</strong><p>不会上传到服务器，也不会保存到模型库。刷新页面后，需要重新导入。</p></div>
        </section>
      </div>
      <section class="import-interface" aria-labelledby="importInterfaceTitle">
        <div class="import-interface-head"><div><span class="import-guide-number">03 / 导入接口</span><h3 id="importInterfaceTitle">选对模型格式，保留你需要的体验</h3></div><a href="/downloads/heritage-glb-interface.md" download>下载完整接口说明 ↓</a></div>
        <div class="import-spec-badges"><span>GLB 2.0</span><span>单文件 ≤ 96 MiB</span><span>贴图与几何内嵌</span><span>米制 · Y 向上</span></div>
        <div class="import-modes">
          <article><h4>普通建筑 · 外观预览</h4><p>标准 GLB 即可。导入后自动居中、缩放并落地，可绕行看外观；整座模型使用包围盒碰撞，不能进入内部。</p></article>
          <article><h4>古建群 · 入内漫游</h4><p>在顶层根节点的 <code>extras.heritageScene</code> 中附通行边界、出生点、碰撞、地面、建筑节点和导览点。通过校验后保留米制布局，可漫游、细看与揭顶。</p></article>
        </div>
        <details class="import-technical"><summary>开发者接口：元数据字段与导出命令</summary>
          <p>这是 GLB 文件内的可选 JSON 契约，不是 HTTP 上传 API。普通查看器仍可显示标准网格。群落根节点及其祖先必须保持单位变换，节点引用必须真实、唯一。</p>
          <dl><dt>version / kind</dt><dd><code>1</code> / <code>"compound"</code></dd><dt>bounds / spawn</dt><dd>通行范围与出生坐标 <code>[x, y, z]</code></dd><dt>colliders / surfaces</dt><dd>墙柱碰撞体与可行走地面高度；门洞不可被整栋包围盒封住</dd><dt>buildings</dt><dd>建筑标识、节点及屋顶引用、门口与室内点、室内范围</dd><dt>walkRoute</dt><dd>可到达的导览点；与模型尺度、地面高度一致</dd></dl>
          <p>技能导出器会按布局参数生成这些字段。以下路径由你替换为实际技能与输出目录：</p>
          <pre tabindex="0" aria-label="GLB 生成和校验命令"><code>node "&lt;skill&gt;/scripts/build_glb.mjs" --spec "&lt;out&gt;/layout.json" --out "&lt;out&gt;/architecture.glb" --report "&lt;out&gt;/build-report.json"
node "&lt;skill&gt;/scripts/validate_glb.mjs" "&lt;out&gt;/architecture.glb"</code></pre>
          <a href="/downloads/heritage-layout-example.json" download>下载三建筑布局参数示例 ↓</a>
          <p class="import-compatibility">新版技能在导出前检查整块地面边界、节点关系和路径连通性；失败时给出具体位置并停止输出。请导出未使用 Draco / Meshopt 几何压缩、KTX2 纹理的版本；本页未配置这些解码器。建筑动画暂不播放。技能校验不等同于官方规范或目标端验证，交付前还需检查实际外观与通行。</p>
        </details>
      </section>
    </div>
    <div class="import-guide-actions"><p id="importGuideStatus" role="status" aria-live="polite">已有模型？直接选择文件即可。</p><button type="button" id="chooseImportFile">选择 GLB 文件 <span>→</span></button></div>`;
  document.body.append(dialog);
  const $ = id => dialog.querySelector('#' + id);
  const choose = $('chooseImportFile'), status = $('importGuideStatus');
  let busy = false, openedFrom, returnDialog, returnScroll = 0;
  $('importPromptText').textContent = SKILL_PROMPT;
  for (const trigger of triggers) {
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', dialog.id);
    trigger.addEventListener('click', event => open(event.currentTarget));
  }
  $('closeImportGuide').onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  choose.onclick = () => { if (!busy) { clearInput?.(); fileInput.click(); } };
  $('copyImportPrompt').onclick = async () => {
    try { await navigator.clipboard.writeText(SKILL_PROMPT); status.textContent = '已复制，可粘贴给你的 agent，并附上建筑参考图。'; }
    catch { dialog.querySelector('.import-example').open = true; status.textContent = '请在展开的示例中选中文字并复制。'; }
  };
  dialog.addEventListener('close', () => {
    clearInput?.();
    const source = returnDialog; returnDialog = null;
    if (!document.querySelector('dialog[open]')) {
      if (source?.isConnected) {
        source.showModal(); source.scrollTop = returnScroll;
        openedFrom?.focus({preventScroll:true}); return;
      }
      const target = document.body.classList.contains('mobile-game') ? document.getElementById('mobileMenuToggle') : document.getElementById('importButton');
      target?.focus({preventScroll:true});
    }
  });
  function open(trigger) {
    clearInput?.();
    openedFrom = trigger;
    returnDialog = trigger.closest('dialog')?.id === 'map' ? trigger.closest('dialog') : null;
    returnScroll = returnDialog?.scrollTop ?? 0;
    document.querySelectorAll('dialog[open]').forEach(other => { if (other !== dialog) other.close(); });
    if (!busy) { status.textContent = '已有模型？直接选择文件即可。'; status.classList.remove('import-error'); }
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.import-guide-body').scrollTop = 0;
    $('importGuideTitle').focus({preventScroll:true});
  }
  return {
    close: () => { returnDialog = null; dialog.close(); },
    setBusy(value) { busy = value; choose.disabled = value; $('closeImportGuide').disabled = value; choose.textContent = value ? '正在读取模型…' : '选择 GLB 文件 →'; if (value) { status.classList.remove('import-error'); status.textContent = '正在检查模型格式、资源与通行数据…'; } },
    showError(message) { status.textContent = '导入失败：' + message; status.classList.add('import-error'); },
  };
}
