const { body, param } = require('express-validator');

const validateGoalScenarios = [
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('目标编号无效'),
  body('scenarios').isArray({ min: 1, max: 12 }).withMessage('请保留 1–12 个场景'),
  body('scenarios.*').custom(value => value && typeof value === 'object' && !Array.isArray(value))
    .withMessage('场景格式无效'),
  body('scenarios.*.title').isString().withMessage('场景标题必须是文字').bail().trim()
    .isLength({ min: 1, max: 100 }).withMessage('场景标题需为 1–100 个字'),
  body('scenarios.*.tasks').isArray({ min: 3, max: 3 }).withMessage('每个场景必须有 3 个子任务'),
  body('scenarios.*.tasks.*').isString().withMessage('子任务必须是文字').bail().trim()
    .isLength({ min: 1, max: 300 }).withMessage('子任务需为 1–300 个字'),
  body('scenarios').custom(scenarios => {
    if (!Array.isArray(scenarios)) return true;
    const titles = scenarios.map(scenario => scenario?.title);
    return new Set(titles).size === titles.length;
  }).withMessage('场景标题不能重复'),
  body('scenarios.*.tasks').custom(tasks => !Array.isArray(tasks) || new Set(tasks).size === tasks.length)
    .withMessage('同一场景的子任务不能重复'),
  body('scenarios.*.image_url').optional({ nullable: true }).isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('场景图片地址必须为有效的 HTTP 或 HTTPS 地址'),
];

module.exports = { validateGoalScenarios };
