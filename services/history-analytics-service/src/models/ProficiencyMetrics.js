const mongoose = require('mongoose');

const ProficiencyMetricsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  language_accuracy: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    default: 0
  },
  complexity_score: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    default: 0
  },
  engagement_level: {
    type: String,
    enum: ['low', 'normal', 'high'],
    default: 'normal'
  },
  improvement_suggestions: [{
    type: String,
    maxlength: 200
  }],
  total_interactions: {
    type: Number,
    default: 0,
    min: 0
  },
  cumulative_accuracy: {
    type: Number,
    default: 0
  },
  cumulative_complexity: {
    type: Number,
    default: 0
  },
  total_proficiency: {
    type: Number,
    default: 0,
    min: 0
  },
  last_updated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Compound index for efficient queries
ProficiencyMetricsSchema.index({ userId: 1, last_updated: -1 });

// Instance method to calculate average metrics
ProficiencyMetricsSchema.methods.getAverageMetrics = function() {
  return {
    language_accuracy: this.language_accuracy,
    complexity_score: this.complexity_score,
    total_interactions: this.total_interactions,
    total_proficiency: this.total_proficiency,
    average_accuracy: this.total_interactions > 0 ? this.cumulative_accuracy / this.total_interactions : 0,
    average_complexity: this.total_interactions > 0 ? this.cumulative_complexity / this.total_interactions : 0
  };
};

// Static method to get user proficiency summary
ProficiencyMetricsSchema.statics.getUserSummary = async function(userId) {
  return await this.findOne({ userId });
};

module.exports = mongoose.model('ProficiencyMetrics', ProficiencyMetricsSchema);