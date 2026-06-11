import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * SupportChat — Tawk.to 在线客服悬浮入口
 *
 * 异步注入 Tawk.to widget 脚本。只有当构建时提供了
 * REACT_APP_TAWK_PROPERTY_ID 和 REACT_APP_TAWK_WIDGET_ID 时才加载——
 * 缺任一则什么都不渲染（开发期/未配置时不报错、不显示残缺入口）。
 *
 * 登录后隐藏（重要）：Tawk widget 脚本一旦注入就跨页面常驻（不随路由卸载移除，
 * 见下方注释），导致从公开页进入应用内页后悬浮球仍漂浮、遮挡 CC/麦克风等功能组件。
 * 因此根据登录态调用 Tawk_API.hideWidget()/showWidget()：
 *   - 未登录（落地/订阅引导给访客看） → 显示
 *   - 已登录（应用内） → 隐藏，避免遮挡功能
 * widget 加载是异步的，hide/show 必须在 onLoad 后才生效，故同时设置
 * Tawk_API.onLoad 回调 + 在 user 变化时主动调用（覆盖"脚本已加载完"的情况）。
 *
 * 配置方式（client/.env 或部署环境变量）：
 *   REACT_APP_TAWK_PROPERTY_ID=<Tawk.to property id>
 *   REACT_APP_TAWK_WIDGET_ID=<Tawk.to widget id, 默认 dashboard 给的是 'default'>
 *
 * 在 Tawk.to 后台 Administration → Channels → Chat Widget 里能拿到
 * 形如 https://embed.tawk.to/<PROPERTY_ID>/<WIDGET_ID> 的嵌入地址。
 *
 * 放置范围：当前只挂在 Landing（落地页）与 Subscription（订阅页），
 * 降低第三方脚本的加载面与隐私影响。需要全站可用时把它提到 App.js。
 *
 * 隐私/合规备注：widget 由 embed.tawk.to 加载并可能采集访客信息，
 * 上线前需在隐私政策中声明第三方客服，并将 embed.tawk.to / *.tawk.to
 * 加入任何 CSP allowlist。
 */
export default function SupportChat() {
  const propertyId = process.env.REACT_APP_TAWK_PROPERTY_ID;
  const widgetId = process.env.REACT_APP_TAWK_WIDGET_ID || 'default';
  const { user } = useAuth();
  const loggedIn = !!user;

  // 注入脚本（仅一次）
  useEffect(() => {
    if (!propertyId) return; // 未配置 → 不加载
    // 防重复注入（多页面切换时只注一次）
    if (document.getElementById('tawk-to-script')) return;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    // widget 加载完成回调：按当前登录态决定显隐（覆盖"脚本注入早于 user 就绪"）
    window.Tawk_API.onLoad = function () {
      try {
        if (window.__tawkHideOnLoad) window.Tawk_API.hideWidget();
        else window.Tawk_API.showWidget();
      } catch { /* ignore */ }
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

  // 登录态变化 → 显隐 widget（脚本已加载时立即生效；未加载时由 onLoad 兜底）
  useEffect(() => {
    if (!propertyId) return;
    // 给 onLoad 回调记录目标态（onLoad 可能晚于此 effect 执行）
    window.__tawkHideOnLoad = loggedIn;
    const api = window.Tawk_API;
    if (api && typeof api.hideWidget === 'function') {
      try {
        if (loggedIn) api.hideWidget();
        else api.showWidget();
      } catch { /* widget 未就绪，靠 onLoad 兜底 */ }
    }
  }, [propertyId, loggedIn]);

  return null;
}
