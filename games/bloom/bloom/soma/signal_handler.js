function(signal) {
  if (signal.type === 'chat') return 'Robby said: "' + signal.data.text + '"';
  if (signal.type === 'tick') return signal.data.stageImpulse;
  return null;
}
