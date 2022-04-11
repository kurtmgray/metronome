let audioContext;

let osc

let tripGainNode
let eighGainNode
let quarGainNode
let sixtGainNode
let measGainNode
let masterGainNode

let unlocked = false;
let isPlaying = false;      // Are we currently playing?
let startTime;              // The start time of the entire sequence.
let currentSubdivision;     // the current part of the 12let

let beat = 0                
let beatsPerMeasure = 4
let tempo = 120.0;          // tempo (in beats per minute)
let lookahead = 25;         // How frequently to call scheduling function (in milliseconds)

let scheduleAheadTime = 0.1;// How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps 
                            // with next interval (in case the timer is late)

let noteTime            // assigned to current time at play()
                        // scheduled to a new time via a formula involving tempo 
                        // and fractional subdivision of the beat
  

let gainValues = {          // subdivision and master volume control
    sixtGain: .1,
    eighGain: .1,
    quarGain: .1,
    tripGain: .1,
    measGain: .1,
    mastGain: .1
}
   
let noteLength = 0.05;      // length of "beep" (in seconds)

// let canvas,                 // the canvas element
//     canvasContext;          // canvasContext is the canvas' context 2D
// let last16thNoteDrawn = -1; // the last "box" we drew on the screen
// let notesInQueue = [];      // the notes that have been put into the web audio,
//                             // and may or may not have played yet. {note, time}
let timerWorker = null;     // The Web Worker used to fire timer messages

let lastClick
let secondToLastClick

function handleTap() {
    const timeNow = new Date().getTime()
    if (secondToLastClick) {
        const difference = timeNow - ((lastClick + secondToLastClick) / 2)
        tempo = Math.floor(60000 / difference) 
    } 
    secondToLastClick = lastClick
    lastClick = timeNow
    if (tempo > 250) return 250
    if (tempo < 30) return 30
    return tempo
}

function volume(value) {
    return gainValues.mastGain * value
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

function nextNote() {
    // define time at which next note should play
    // secondsPerBeat converts tempo into seconds
    const secondsPerBeat = 60.0 / tempo;    // Notice this picks up the CURRENT 
                                          // tempo value to calculate beat length.
    noteTime += (1/12) * secondsPerBeat;
    currentSubdivision++
    if (currentSubdivision === beatsPerMeasure * 12) {
        console.log('measure')
        currentSubdivision = 0
        beat = 0
    }
    if (currentSubdivision % 12 === 0) {
        beat++
    }    
}

function scheduleNote( time ) {
    document.getElementById('beat').innerText = beat
    
    osc = audioContext.createOscillator();
    gainNode = audioContext.createGain()
    osc.connect(gainNode);
    gainNode.connect(audioContext.destination)          
    
    if (currentSubdivision % (beatsPerMeasure * 12) === 0) {
        if (gainValues.measGain > 0) {
            osc.frequency.value = 1340.0;
            gainNode.gain.value = volume(gainValues.measGain)    
        } else {
            osc.frequency.value = 440.0;
            gainNode.gain.value = volume(gainValues.quarGain)
        }
    }
    else if (currentSubdivision % 12 === 0) {
        osc.frequency.value = 440.0;
        gainNode.gain.value = volume(gainValues.quarGain)
    } 
    else if (currentSubdivision % 6 === 0) {
        osc.frequency.value = 260.0;
        gainNode.gain.value = volume(gainValues.eighGain)
    }
    else if (currentSubdivision % 4 === 0) {
        osc.frequency.value = 660.0;
        gainNode.gain.value = volume(gainValues.tripGain)
    }
    else if (currentSubdivision % 3 === 0) {
        osc.frequency.value = 220.0;
        gainNode.gain.value = volume(gainValues.sixtGain)
    } else {
        gainNode.gain.value = 0                             // mute all other 12let notes
    }
                                                            // use 8 for HNT and 2 for TS
    osc.start(time)
    osc.stop(time + noteLength)
}

function scheduler() {
    if (noteTime < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote(noteTime);
        nextNote();
    }
}

function play() {
    lastClick = null
    beat = 1
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
        currentSubdivision = 0
        noteTime = audioContext.currentTime + .05,
        timerWorker.postMessage("start");
        return "Stop";
    } else {
        document.getElementById('beat').innerText = 1
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
            scheduler();
        }
        else
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
}

window.addEventListener("load", init );

// 