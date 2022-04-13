var timerID=null;
var interval=100;

self.onmessage=function(e){
	console.log(e)
	if (e.data == "start") {
		console.log("starting");
		timerID = setInterval(()=>postMessage("tick"),interval)
	}
	else if (e.data.interval) {
		console.log("setting interval");
		interval=e.data.interval;
		console.log("interval="+interval);
		if (timerID) {
			clearInterval(timerID);
			timerID = setInterval(()=>postMessage("tick"),interval)

		}
	}
	else if (e.data=="stop") {
		console.log("stopping");
		clearInterval(timerID);
		timerID=null;
	}
};

postMessage('worker initialized');

/*
Flow:
	init() 
		establishes audio context and a Worker instance
		sets a listener (.onmessage) to call scheduler() when "tick" is posted by the worker
		postMessage {"interval": lookahead} to the worker, worker uses as interval 
			to postMessage("tick") for calls of scheduler() to occur

	play()
		handles "locked" audio on some browsers
		toggles isPlaying - play() also handles stopping
		if isPlaying, 
			set currentSubdivision at 0
			set nextNoteTime to right now
			send "start" to Worker
				worker setInterval starts postMessaging "tick" to trigger scheduler() calls
		if !isPlaying (clicked again to stop)
			send "stop to worker"
				worker clears the interval and sets ID to null

	scheduler()
		while there are notes that are already scheduled (nextNoteTime) to play before
			now and the scheduleAheadTime
			scheduleNote(), passing currentSubdivision and the nextNoteTime
				scheduleNote() processes which subdivision we are on, 
			also call nextNote()
				which sets nextNoteTime based on the selected resolution and tempo

	nextNote()
		sets nextNoteTime based on the selected resolution and tempo
		loops to 0.. currentSubdivision 12 or 16 is treated as beat 1 by the oscillator

*/

/*
Things to implement:
	- All subdivisions playing at once
	- Volume control on each subdivision (and beat 1 accent)
	
	- 16th play only e's and a's
	- 8th play only +'s
	
	- Overall volume control - overall gain node?
	- Display the current beat number

	- Tap/Click to set tempo
	
	Tone.js?
	
	- Different sound schemes
		(load via different sources?)

	Loops
		stored in memory (backend)
		user can define:
			tempo,
			time signature,
			subdivision,
			volume,
			sound scheme,
			number of iterations,
			what to do at the end of all iterations,

	Memory slots for storing loops 
		titling
	
	UX
		Met on load
		Memory -> login
		Write -> compose loops
		Mute -> mute all sounds
		Tap -> tap tempo
		Start/Stop

	Issues:
		(SOLVED) subdivisions become out of sync when speeding up tempo
			solution to have 5 separate oscillators?
			maybe solved when loading sounds differently?
			(SOLUTION)
				run a single osc with a single call to schedule 12lets
				divide by 12 for Q, 6 for E, 4 for T, 3 for Q, mute all others
					can do 8 for HNT and 2 for TS
*/