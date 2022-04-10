let audioContext;

let oscTrip
let oscEigh
let oscQuar
let oscSixt
let oscMeas

let tripGainNode
let eighGainNode
let quarGainNode
let sixtGainNode
let measGainNode
let masterGainNode

let unlocked = false;
let isPlaying = false;      // Are we currently playing?
let startTime;              // The start time of the entire sequence.
let currentSubdivision = {
    sixteenth: 0,
    eighth: 0,
    triplet: 0
};

let beat = 0                
let beatsPerMeasure = 4
let tempo = 120.0;          // tempo (in beats per minute)
let lookahead = 25;         // How frequently to call scheduling function (in milliseconds)

let scheduleAheadTime = 0.1;// How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps 
                            // with next interval (in case the timer is late)

let noteTime = {            // assigned to current time at play()
    sixteenth: 0.0,         // scheduled to a new time via a formula involving tempo 
    eighth: 0.0,            // and fractional subdivision of the beat
    quarter: 0.0,
    triplet: 0.0,
    measure: 0.0
}

let gainValues = {          // subdivision and master volume control
    sixtGain: .1,
    eighGain: .1,
    quarGain: .1,
    tripGain: .1,
    measGain: .1,
    mastGain: .5
}
   
let noteLength = 0.05;      // length of "beep" (in seconds)

// let canvas,                 // the canvas element
//     canvasContext;          // canvasContext is the canvas' context 2D
// let last16thNoteDrawn = -1; // the last "box" we drew on the screen
// let notesInQueue = [];      // the notes that have been put into the web audio,
//                             // and may or may not have played yet. {note, time}
let timerWorker = null;     // The Web Worker used to fire timer messages

let lastClick

function handleTap(e) {
    const timeNow = new Date().getTime()
    if (lastClick) {
        const difference = timeNow - lastClick
        tempo = Math.floor(60000 / difference) 
    } 
    lastClick = timeNow
    console.log(tempo)
    return tempo
}

function volume(value) {
    return gainValues.mastGain * value
}

function playSixteenth(time) {    
    osc.frequency.value = 220.0;
    gainNode.gain.value = volume(gainValues.sixtGain)
    osc.start(time)
    osc.stop(time + noteLength)
}

function playEighth(time) {
    osc.frequency.value = 260.0;
    gainNode.gain.value = volume(gainValues.eighGain)
    osc.start(time)
    osc.stop(time + noteLength)
}

function playQuarter(time) {
    osc.frequency.value = 440.0;
    gainNode.gain.value = volume(gainValues.quarGain)
    osc.start(time)
    osc.stop(time + noteLength);
}

function playTriplet(time) {
    osc.frequency.value = 660.0;
    gainNode.gain.value = volume(gainValues.tripGain)
    osc.start(time)
    osc.stop(time + noteLength);
}

function playMeasure (time) {    
    osc.frequency.value = 1320.0;
    gainNode.gain.value = volume(gainValues.measGain)
    osc.start(time)
    osc.stop(time + noteLength)
}
// First, let's shim the requestAnimationFrame API, with a setTimeout fallback
// window.requestAnimFrame = (function(){
//     return  window.requestAnimationFrame ||
//     window.webkitRequestAnimationFrame ||
//     window.mozRequestAnimationFrame ||
//     window.oRequestAnimationFrame ||
//     window.msRequestAnimationFrame ||
//     function( callback ){
//         window.setTimeout(callback, 1000 / 60);
//     };
// })();

function nextNote(subdivision) {
    // define time at which next note should play
    // secondsPerBeat converts tempo into seconds
    // subdivision 
    const secondsPerBeat = 60.0 / tempo;    // Notice this picks up the CURRENT 
                                          // tempo value to calculate beat length.
    if (subdivision === 0.25) {
        noteTime.sixteenth += subdivision * secondsPerBeat;
        currentSubdivision.sixteenth++
        if (currentSubdivision.sixteenth === 4) {
            currentSubdivision.sixteenth = 0
        }    
    }
    if (subdivision === 0.5) {
        noteTime.eighth += subdivision * secondsPerBeat;
        currentSubdivision.eighth++
        if (currentSubdivision.eighth === 2) {
            currentSubdivision.eighth = 0
        }    
    }   
    if (subdivision === 1/3) {
        noteTime.triplet += subdivision * secondsPerBeat
        currentSubdivision.triplet++
        if (currentSubdivision.triplet === 3) {
            currentSubdivision.triplet = 0
        }
    }
    if (subdivision === 1) {
        noteTime.quarter += subdivision * secondsPerBeat;
        beat++
        document.getElementById('beat').innerText = `Beat ${beat}`    
    }
    if (subdivision === beatsPerMeasure) {
        noteTime.measure += beatsPerMeasure * secondsPerBeat
        beat = 1
        document.getElementById('beat').innerText = `Beat ${beat}`    
    }
}


function scheduleNote( value, time ) {
    osc = audioContext.createOscillator();
    gainNode = audioContext.createGain()
    osc.connect(gainNode);
    gainNode.connect(audioContext.destination)

    if (value === "quarter") {
        playQuarter(time)
    }
    if (value === "triplet") {
        if (currentSubdivision.triplet % 3 !== 0) {
            playTriplet(time)
        }
    }
    if (value === "eighth") {
        if (currentSubdivision.eighth % 2 !== 0) {
            playEighth(time)
        }     
    }
    if (value === "sixteenth") {
        if (currentSubdivision.sixteenth % 2 !== 0) {
            playSixteenth(time)
        }
    }
    if (value === "measure") {
        console.log("measure")
        playMeasure(time)
    }
}

function scheduler(time) {
    if (time.triplet < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote("triplet", time.triplet);
        nextNote(1/3);
    }
    if (time.eighth < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote("eighth", time.eighth);
        nextNote(0.5);
    }
    if (time.quarter < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote("quarter", time.quarter);
        nextNote(1);
    }
    if (time.sixteenth < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote("sixteenth", time.sixteenth );
        nextNote(0.25);
    }
    if (time.measure < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote("measure", time.measure );
        nextNote(beatsPerMeasure);
    }
}

function play() {
    lastClick = null
    if (!unlocked) {
      // play silent buffer to unlock the audio
      let buffer = audioContext.createBuffer(1, 1, 22050);
      let node = audioContext.createBufferSource();
      node.buffer = buffer;
      node.start(0);
      unlocked = true;
    }

    isPlaying = !isPlaying;

    if (isPlaying) { 
        currentSubdivision = {
            sixteenth: 0,
            eighth: 0,
            quarter: 0,
            triplet: 0
        };
        noteTime = {
            sixteenth: audioContext.currentTime + .05,
            eighth: audioContext.currentTime + .05,
            quarter: audioContext.currentTime + .05,
            triplet: audioContext.currentTime + .05,
            measure: audioContext.currentTime + .05 
        }
        timerWorker.postMessage("start");
        return "Stop";
    } else {
        timerWorker.postMessage("stop");
        return "Play";
    }
}

// function resetCanvas (e) {
//     // resize the canvas - but remember - this clears the canvas too.
//     canvas.width = window.innerWidth;
//     canvas.height = window.innerHeight;

//     //make sure we scroll to the top left.
//     window.scrollTo(0,0); 
// }

// function draw() {
//     let currentNote = last16thNoteDrawn;
//     let currentTime = audioContext.currentTime;

//     while (notesInQueue.length && notesInQueue[0].time < currentTime) {
//         currentNote = notesInQueue[0].note;
//         notesInQueue.splice(0,1);   // remove note from queue
//     }

//     // We only need to draw if the note has moved.
//     if (last16thNoteDrawn != currentNote) {
//         let x = Math.floor( canvas.width / 18 );
//         canvasContext.clearRect(0,0,canvas.width, canvas.height); 
//         for (let i=0; i<16; i++) {
//             canvasContext.fillStyle = ( currentNote == i ) ? 
//                 ((currentNote%4 === 0)?"red":"blue") : "black";
//             canvasContext.fillRect( x * (i+1), x, x/2, x/2 );
//         }
//         last16thNoteDrawn = currentNote;
//     }

//     // set up to draw again
//     requestAnimFrame(draw);
// }

function init(){
    // let container = document.createElement( 'div' );

    // container.className = "container";
    // canvas = document.createElement( 'canvas' );
    // canvasContext = canvas.getContext( '2d' );
    // canvas.width = window.innerWidth; 
    // canvas.height = window.innerHeight; 
    // document.body.appendChild( container );
    // container.appendChild(canvas);    
    // canvasContext.strokeStyle = "#ffffff";
    // canvasContext.lineWidth = 2;

    // NOTE: THIS RELIES ON THE MONKEYPATCH LIBRARY BEING LOADED FROM
    // Http://cwilso.github.io/AudioContext-MonkeyPatch/AudioContextMonkeyPatch.js
    // TO WORK ON CURRENT CHROME!!  But this means our code can be properly
    // spec-compliant, and work on Chrome, Safari and Firefox.


    // if we wanted to load audio files, etc., this is where we should do it.

    // window.onorientationchange = resetCanvas;
    // window.onresize = resetCanvas;

    // requestAnimFrame(draw);    // start the drawing loop.

    audioContext = new AudioContext()

    timerWorker = new Worker("js/metronomeworker.js");
    timerWorker.onmessage = function(e) {
        if (e.data == "tick") {
            console.log("tick!");
            scheduler(noteTime);
        }
        else
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
}

window.addEventListener("load", init );

// 