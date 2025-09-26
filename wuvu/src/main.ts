console.log('Wuvu game starting...');

// Initialize the game
function init() {
    const app = document.getElementById('app');
    if (app) {
        app.innerHTML = '<h1>Wuvu</h1><p>Game will be implemented here...</p>';
    }
}

// Start the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);