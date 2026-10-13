const db = require('../models/db');
const { readAccess, authorize } = require('../models/sceneAccess');

exports.check = async (req, res) => {
  try {
    const snapshot = await readAccess(db, req.user?.id || req.params.id);
    const decision = authorize(snapshot, req.body);
    res.set('Cache-Control', 'no-store');
    return res.status(decision.status).json({ ...decision, access: snapshot?.access });
  } catch (_) {
    return res.status(503).json({ allowed: false, status: 503, reason: 'authorization_unavailable' });
  }
};

exports.snapshot = async (req, res) => {
  try {
    const snapshot = await readAccess(db, req.params.id);
    if (!snapshot) return res.status(401).json({ reason: 'account_unavailable' });
    res.set('Cache-Control', 'no-store');
    return res.json({ data: snapshot });
  } catch (_) {
    return res.status(503).json({ reason: 'authorization_unavailable' });
  }
};
