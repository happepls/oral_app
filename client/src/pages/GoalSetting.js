import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';

const PRESET_SCENARIOS = {
  daily_conversation: [
    { title: "Casual Greetings", tasks: ["Greet someone you just met", "Ask how someone is doing", "Make small talk about the weather"] },
    { title: "Coffee Shop Order", tasks: ["Order your favorite drink", "Ask about menu items", "Request modifications"] },
    { title: "Grocery Shopping", tasks: ["Ask for item locations", "Request quantity and price", "Handle checkout conversation"] },
    { title: "Directions", tasks: ["Ask for directions to a location", "Clarify route details", "Thank for help"] },
    { title: "Phone Call Basics", tasks: ["Answer a phone call properly", "Ask who is calling", "End a call politely"] },
    { title: "Restaurant Dining", tasks: ["Make a reservation", "Order food from menu", "Ask for the bill"] },
    { title: "Public Transport", tasks: ["Ask about schedules", "Buy a ticket", "Confirm your stop"] },
    { title: "Weekend Plans", tasks: ["Discuss weekend activities", "Make suggestions", "Accept or decline invitations"] },
    { title: "Hobbies Discussion", tasks: ["Share your hobbies", "Ask about others' interests", "Make related plans"] },
    { title: "Small Talk (Culture)", tasks: ["Discuss local customs", "Share interesting facts", "Express opinions politely"] }
  ],
  business_meeting: [
    { title: "Self Introduction", tasks: ["Introduce yourself professionally", "Share your role and company", "Exchange contact information"] },
    { title: "Meeting Scheduling", tasks: ["Propose meeting times", "Confirm availability", "Send meeting invites"] },
    { title: "Project Status Update", tasks: ["Summarize current progress", "Discuss blockers", "Plan next steps"] },
    { title: "Client Presentation", tasks: ["Open a presentation", "Explain key points", "Handle Q&A"] },
    { title: "Negotiation Basics", tasks: ["State your position", "Listen to counteroffers", "Reach a compromise"] },
    { title: "Email Discussion", tasks: ["Reference an important email", "Clarify email contents", "Agree on follow-up actions"] },
    { title: "Team Collaboration", tasks: ["Assign tasks to team members", "Check on task progress", "Provide feedback"] },
    { title: "Conference Call", tasks: ["Join a video call", "Share your screen", "Wrap up the call"] },
    { title: "Deadline Management", tasks: ["Discuss timeline constraints", "Request deadline extension", "Commit to new dates"] },
    { title: "Professional Small Talk", tasks: ["Chat about industry news", "Discuss career journeys", "Build rapport"] }
  ],
  travel_survival: [
    { title: "Airport Check-in", tasks: ["Check in for your flight", "Ask about seat preferences", "Handle baggage check"] },
    { title: "Immigration Control", tasks: ["Answer officer questions", "Explain your trip purpose", "Provide required documents"] },
    { title: "Hotel Reservation", tasks: ["Book a room", "Ask about amenities", "Request early check-in"] },
    { title: "Taxi & Rideshare", tasks: ["Request a ride", "Give your destination", "Handle payment"] },
    { title: "Asking Directions", tasks: ["Ask how to get somewhere", "Understand landmark references", "Confirm the route"] },
    { title: "Restaurant Ordering", tasks: ["Ask for recommendations", "Order local cuisine", "Handle dietary requirements"] },
    { title: "Shopping Abroad", tasks: ["Ask prices", "Negotiate or bargain", "Request tax refund info"] },
    { title: "Emergency Situations", tasks: ["Ask for help", "Explain your situation", "Contact emergency services"] },
    { title: "Sightseeing Tours", tasks: ["Book a tour", "Ask tour guide questions", "Express interest or concerns"] },
    { title: "Cultural Small Talk", tasks: ["Discuss local culture", "Share your impressions", "Learn local expressions"] }
  ],
  exam_prep: [
    { title: "Self Introduction (Exam)", tasks: ["Introduce yourself clearly", "Mention your background", "State your goals"] },
    { title: "Describing Pictures", tasks: ["Describe a photo in detail", "Compare two images", "Express your opinion"] },
    { title: "Opinion Questions", tasks: ["State your opinion clearly", "Give supporting reasons", "Conclude your answer"] },
    { title: "Problem Solving", tasks: ["Identify the problem", "Suggest solutions", "Evaluate options"] },
    { title: "Role-play Scenarios", tasks: ["Understand the situation", "Respond appropriately", "Handle follow-ups"] },
    { title: "Discussion & Debate", tasks: ["Express agreement/disagreement", "Build on others' points", "Summarize the discussion"] },
    { title: "Long Turn Speaking", tasks: ["Speak for 1-2 minutes fluently", "Structure your answer", "Manage your time"] },
    { title: "Pronunciation Practice", tasks: ["Practice difficult sounds", "Work on intonation", "Reduce accent interference"] },
    { title: "Vocabulary Expansion", tasks: ["Use academic vocabulary", "Explain complex terms", "Paraphrase effectively"] },
    { title: "Mock Exam Practice", tasks: ["Complete a timed practice", "Self-evaluate performance", "Identify improvement areas"] }
  ],
  presentation: [
    { title: "Opening Strong", tasks: ["Grab audience attention", "Introduce your topic", "Preview main points"] },
    { title: "Explaining Data", tasks: ["Present statistics clearly", "Interpret chart information", "Draw conclusions"] },
    { title: "Storytelling", tasks: ["Share a relevant story", "Connect to your message", "Engage emotionally"] },
    { title: "Handling Q&A", tasks: ["Listen carefully to questions", "Provide clear answers", "Handle difficult questions"] },
    { title: "Visual Aid Description", tasks: ["Reference your slides", "Explain diagrams", "Guide audience attention"] },
    { title: "Transitions", tasks: ["Move between topics smoothly", "Recap previous points", "Preview next sections"] },
    { title: "Persuasion Techniques", tasks: ["Present your argument", "Address counter-arguments", "Call to action"] },
    { title: "Closing Impact", tasks: ["Summarize key takeaways", "End with a memorable statement", "Thank your audience"] },
    { title: "Team Presentation", tasks: ["Coordinate with co-presenters", "Handle handoffs", "Support each other"] },
    { title: "Impromptu Speaking", tasks: ["Speak on unexpected topics", "Organize thoughts quickly", "Deliver confidently"] }
  ]
};

function GoalSetting() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  
  const [step, setStep] = useState(1);
  const [type, setType] = useState('daily_conversation');
  const [description, setDescription] = useState('');
  const [targetLevel, setTargetLevel] = useState('Intermediate');
  const [completionDays, setCompletionDays] = useState(30);
  const [scenarios, setScenarios] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const targetLanguage = user?.target_language || 'English';
  const currentProficiency = user?.points || 30;

  const handleGenerateScenarios = () => {
    setIsGenerating(true);
    setError('');
    
    setTimeout(() => {
      const presetList = PRESET_SCENARIOS[type] || PRESET_SCENARIOS.daily_conversation;
      setScenarios(presetList.map((s, idx) => ({ ...s, id: idx })));
      setIsGenerating(false);
      setStep(2);
    }, 1000);
  };

  const handleRemoveScenario = (id) => {
    setScenarios(scenarios.filter(s => s.id !== id));
  };

  const handleSubmit = async () => {
    if (scenarios.length === 0) {
      setError('Please keep at least one scenario.');
      return;
    }

    setError('');
    setSuccess('');

    try {
      const goalData = {
        type,
        description: description || `Practice ${targetLanguage} for ${type.replace(/_/g, ' ')}`,
        target_language: targetLanguage,
        target_level: targetLevel,
        current_proficiency: currentProficiency,
        completion_time_days: completionDays,
        interests: user?.interests || '',
        scenarios: scenarios.map(s => ({
          title: s.title,
          tasks: s.tasks
        }))
      };

      const result = await userAPI.createGoal(goalData);

      if (result) {
        setSuccess('Your learning goal is set. Let\'s start practicing!');
        setTimeout(() => navigate('/discovery'), 1500);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to set goal. Please try again.');
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      <div className="flex w-full max-w-lg flex-col items-center justify-start flex-grow pt-8">
        <div className="w-full px-4">
          {step === 1 && (
            <>
              <h1 className="text-slate-900 dark:text-white text-3xl font-bold mb-2">Set Your {targetLanguage} Goal</h1>
              <p className="text-slate-600 dark:text-slate-400 mb-8">A clear goal is half the battle.</p>

              <div className="space-y-4">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="type" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Goal Type
                  </label>
                  <select
                    id="type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                  >
                    <option value="daily_conversation">Daily Conversation</option>
                    <option value="business_meeting">Business Meeting</option>
                    <option value="travel_survival">Travel Survival</option>
                    <option value="exam_prep">Exam Preparation</option>
                    <option value="presentation">Presentation Skills</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="targetLevel" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Target Level
                  </label>
                  <select
                    id="targetLevel"
                    value={targetLevel}
                    onChange={(e) => setTargetLevel(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Native">Native-like</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="days" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Complete In (days)
                  </label>
                  <input
                    type="number"
                    id="days"
                    min="7"
                    max="180"
                    value={completionDays}
                    onChange={(e) => setCompletionDays(parseInt(e.target.value) || 30)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Additional Notes (optional)
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows="3"
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                    placeholder={`e.g., "I'm traveling to Japan next month..."`}
                  ></textarea>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateScenarios}
                  disabled={loading || isGenerating}
                  className="w-full mt-6 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {isGenerating ? 'Generating Scenarios...' : 'Generate Practice Scenarios'}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-slate-900 dark:text-white text-2xl font-bold">Your Practice Scenarios</h1>
                <button
                  onClick={() => setStep(1)}
                  className="text-primary text-sm hover:underline"
                >
                  Back
                </button>
              </div>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                {scenarios.length} scenarios tailored for your goal. You can remove any you don't need.
              </p>

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-green-500/10 border border-green-500/50 text-green-500 px-4 py-3 rounded-lg text-sm mb-4">
                  {success}
                </div>
              )}

              <div className="space-y-3 max-h-[50vh] overflow-y-auto mb-6">
                {scenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 relative group"
                  >
                    <button
                      onClick={() => handleRemoveScenario(scenario.id)}
                      className="absolute top-2 right-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                    <h3 className="text-slate-900 dark:text-white font-medium mb-2">{scenario.title}</h3>
                    <ul className="text-slate-600 dark:text-slate-400 text-sm space-y-1">
                      {scenario.tasks.map((task, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="text-primary mr-2">•</span>
                          {task}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || scenarios.length === 0}
                className="w-full flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Confirm & Start Learning
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default GoalSetting;
