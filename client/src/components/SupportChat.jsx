import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * SupportChat — Tawk.to 在线客服悬浮入口（全局挂载于 App.js）
 *
 * 异步注入 Tawk.to widget 脚本。只有当构建时提供了
 * REACT_APP_TAWK_PROPERTY_ID 和 REACT_APP_TAWK_WIDGET_ID 时才加载——
 * 缺任一则什么都不渲染（开发期/未配置时不报错、不显示残缺入口）。
 *
 * 按路由显隐（重要）：Tawk widget 脚本一旦注入就跨页面常驻（不随路由卸载移除，
 * 见下方注释），若不主动控制，从落地页进入应用内页后悬浮球仍漂浮、遮挡
 * CC/麦克风等功能组件。因此本组件挂在 App.js 顶层，监听 pathname，
 * 仅在「客服可见页」(landing `/` 与订阅页 `/subscription*`) 调 showWidget()，
 * 其它所有页面（含登录后内页 /discovery、/conversation 等）一律 hideWidget()。
 *   - 显隐基于「当前页面」而非「登录态」：已登录用户回访 landing 仍能看到客服，
 *     访客在内页（理论上不会进入）也不会残留。
 * widget 加载是异步的，hide/show 必须在 onLoad 后才生效，故同时设置
 * Tawk_API.onLoad 回调 + 在 pathname 变化时主动调用（覆盖"脚本已加载完"的情况）。
 *
 * 配置方式（client/.env 或部署环境变量）：
 *   REACT_APP_TAWK_PROPERTY_ID=<Tawk.to property id>
 *   REACT_APP_TAWK_WIDGET_ID=<Tawk.to widget id, 默认 dashboard 给的是 'default'>
 *
 * 在 Tawk.to 后台 Administration → Channels → Chat Widget 里能拿到
 * 形如 https://embed.tawk.to/<PROPERTY_ID>/<WIDGET_ID> 的嵌入地址。
 *
 * 隐私/合规备注：widget 由 embed.tawk.to 加载并可能采集访客信息，
 * 上线前需在隐私政策中声明第三方客服，并将 embed.tawk.to / *.tawk.to
 * 加入任何 CSP allowlist。
 */

// 客服 widget 可见的页面：仅落地页与订阅页（订阅页给访客看定价）。
function isVisiblePath(pathname) {
  return pathname === '/' || pathname.startsWith('/subscription');
}

export default function SupportChat() {
  const propertyId = process.env.REACT_APP_TAWK_PROPERTY_ID;
  const widgetId = process.env.REACT_APP_TAWK_WIDGET_ID || 'default';
  const { pathname } = useLocation();
  const visible = isVisiblePath(pathname);

  // 注入脚本（仅一次）
  useEffect(() => {
    if (!propertyId) return; // 未配置 → 不加载
    // 防重复注入（多页面切换时只注一次）
    if (document.getElementById('tawk-to-script')) return;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    // widget 加载完成回调：按当前页面决定显隐（覆盖"脚本注入早于路由就绪"）
    window.Tawk_API.onLoad = function () {
      try {
        if (window.__tawkVisible) window.Tawk_API.showWidget();
        else window.Tawk_API.hideWidget();
      } catch (e) { console.warn('[SupportChat] onLoad error:', e); }
    };

    const script = document.createElement('script');
    script.id = 'tawk-to-script';
    script.async = true;
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    document.body.appendChild(script);

    // 不在卸载时移除脚本：Tawk widget 跨页面保持，移除会导致重复初始化抖动。
  }, [propertyId, widgetId]);

  // 路由变化 → 显隐 widget（脚本已加载时立即生效；未加载时由 onLoad 兜底）
  useEffect(() => {
    if (!propertyId) return;
    // 给 onLoad 回调记录目标态（onLoad 可能晚于此 effect 执行）
    window.__tawkVisible = visible;
    const api = window.Tawk_API;
    if (api && typeof api.hideWidget === 'function') {
      try {
        if (visible) api.showWidget();
        else api.hideWidget();
      } catch { /* widget 未就绪，靠 onLoad 兜底 */ }
    }
  }, [propertyId, visible]);

  return null;
}
