// A clock for the stage while its page is hidden. Browsers stop animation frames in a
// hidden tab and slow its timers, but leave a worker's timers mostly alone, so while the
// ludant is busy (thinking, painting, playtesting) and nobody is looking, the stage
// keeps time from here.
let timer = null;
onmessage = (e) => {
  clearInterval(timer);
  timer = e.data === 'start' ? setInterval(() => postMessage(performance.now()), 1000 / 60) : null;
};
