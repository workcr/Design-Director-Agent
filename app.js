// Design Mastery Platform — Core JavaScript

// Progress Tracking System
class ProgressTracker {
    constructor() {
        this.storageKey = 'designMasteryProgress';
        this.progress = this.loadProgress();
    }

    loadProgress() {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
            return JSON.parse(stored);
        }

        return {
            modules: {
                1: { completed: false, exercises: [], percentage: 0 },
                2: { completed: false, exercises: [], percentage: 0 },
                3: { completed: false, exercises: [], percentage: 0 },
                4: { completed: false, exercises: [], percentage: 0 },
                5: { completed: false, exercises: [], percentage: 0 },
                6: { completed: false, exercises: [], percentage: 0 },
                7: { completed: false, exercises: [], percentage: 0 },
                8: { completed: false, exercises: [], percentage: 0 },
                9: { completed: false, exercises: [], percentage: 0 }
            },
            capstoneStarted: false,
            capstoneCompleted: false,
            startDate: new Date().toISOString()
        };
    }

    saveProgress() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.progress));
    }

    completeExercise(moduleNumber, exerciseId) {
        const module = this.progress.modules[moduleNumber];
        if (!module.exercises.includes(exerciseId)) {
            module.exercises.push(exerciseId);
            this.updateModulePercentage(moduleNumber);
            this.saveProgress();
        }
    }

    uncompleteExercise(moduleNumber, exerciseId) {
        const module = this.progress.modules[moduleNumber];
        const index = module.exercises.indexOf(exerciseId);
        if (index > -1) {
            module.exercises.splice(index, 1);
            this.updateModulePercentage(moduleNumber);
            this.saveProgress();
        }
    }

    updateModulePercentage(moduleNumber) {
        const exerciseCounts = {
            1: 6, 2: 8, 3: 7, 4: 5, 5: 4, 6: 6, 7: 5, 8: 5, 9: 0
        };

        const module = this.progress.modules[moduleNumber];
        const totalExercises = exerciseCounts[moduleNumber];

        if (totalExercises > 0) {
            module.percentage = Math.round((module.exercises.length / totalExercises) * 100);
            module.completed = module.percentage === 100;
        }
    }

    getOverallProgress() {
        const moduleCount = 9;
        let totalPercentage = 0;
        let completedModules = 0;

        for (let i = 1; i <= moduleCount; i++) {
            totalPercentage += this.progress.modules[i].percentage;
            if (this.progress.modules[i].completed) {
                completedModules++;
            }
        }

        return {
            overallPercentage: Math.round(totalPercentage / moduleCount),
            completedModules: completedModules,
            totalModules: moduleCount,
            completedExercises: this.getTotalCompletedExercises()
        };
    }

    getTotalCompletedExercises() {
        let total = 0;
        for (let i = 1; i <= 9; i++) {
            total += this.progress.modules[i].exercises.length;
        }
        return total;
    }

    getModuleProgress(moduleNumber) {
        return this.progress.modules[moduleNumber];
    }

    resetProgress() {
        if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
            localStorage.removeItem(this.storageKey);
            this.progress = this.loadProgress();
            location.reload();
        }
    }
}

// Initialize tracker
const tracker = new ProgressTracker();

// Exercise completion toggles
document.addEventListener('DOMContentLoaded', () => {
    // Handle exercise checkboxes
    const exerciseCheckboxes = document.querySelectorAll('.exercise-checkbox');

    exerciseCheckboxes.forEach(checkbox => {
        const moduleNumber = parseInt(checkbox.dataset.module);
        const exerciseId = checkbox.dataset.exercise;
        const moduleProgress = tracker.getModuleProgress(moduleNumber);

        // Set initial state
        if (moduleProgress.exercises.includes(exerciseId)) {
            checkbox.checked = true;
        }

        // Handle changes
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                tracker.completeExercise(moduleNumber, exerciseId);
            } else {
                tracker.uncompleteExercise(moduleNumber, exerciseId);
            }
            updateProgressDisplay();
        });
    });

    // Update progress displays
    updateProgressDisplay();
});

function updateProgressDisplay() {
    const overall = tracker.getOverallProgress();

    // Update overall stats
    const overallPercentageEl = document.getElementById('overall-percentage');
    const completedModulesEl = document.getElementById('completed-modules');
    const completedExercisesEl = document.getElementById('completed-exercises');

    if (overallPercentageEl) {
        overallPercentageEl.textContent = overall.overallPercentage + '%';
    }

    if (completedModulesEl) {
        completedModulesEl.textContent = overall.completedModules;
    }

    if (completedExercisesEl) {
        completedExercisesEl.textContent = overall.completedExercises;
    }

    // Update individual module progress bars
    for (let i = 1; i <= 9; i++) {
        const module = tracker.getModuleProgress(i);
        const progressBar = document.querySelector(`.module-${i}-progress`);
        const progressText = document.querySelector(`.module-${i}-percentage`);

        if (progressBar) {
            progressBar.style.width = module.percentage + '%';
        }

        if (progressText) {
            progressText.textContent = module.percentage + '%';
        }
    }
}

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    });
});

// Export functions for global use
window.DesignMastery = {
    tracker: tracker,
    updateProgressDisplay: updateProgressDisplay
};
