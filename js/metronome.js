// const { Tone } = require("tone/build/esm/core/Tone");

let audioContext;

let osc
let audio

const presets = []

let loop = 0
let maxLoops = 0
let loopMode = false
// let preset = 0
// let totalPresets = presets.length ? presets.length : 0

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
    sixtGain: 0,
    eighGain: 0,
    quarGain: 1,
    tripGain: 0,
    measGain: 1,
    mastGain: 0
}

// let nextLoop1 = {
//     tempo: 160,
//     sixtGain: 1, 
//     eighGain: 1,
//     tripGain: 0,
//     quarGain: 1,
//     measGain: 1,
//     mastGain: 1,
//     maxLoops: 3
// }
   
let noteLength = 0.05;      // length of "beep" (in seconds)

// let canvas,                 // the canvas element
//     canvasContext;          // canvasContext is the canvas' context 2D
// let last16thNoteDrawn = -1; // the last "box" we drew on the screen
// let notesInQueue = [];      // the notes that have been put into the web audio,
//                             // and may or may not have played yet. {note, time}
let timerWorker = null;     // The Web Worker used to fire timer messages

let lastClick
let secondToLastClick

let clapBuffer // measure
let kickBuffer // quarter
let snareBuffer // eighth
let hihatBuffer // sixteenth
let tomBuffer // triplet

function savePresets() {
    const preset = {
        tempo: tempo,
        sixtGain: gainValues.sixtGain, 
        eighGain: gainValues.eighGain,
        tripGain: gainValues.tripGain,
        quarGain: gainValues.quarGain,
        measGain: gainValues.measGain,
        mastGain: gainValues.mastGain,
        maxLoops: maxLoops
    }
    presets.push(preset)
    console.log(presets)
}

async function loadTom(url) {
    let response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return audioBuffer
}
async function setupTom() {
    tomBuffer = await loadTom('sounds/tom.wav')
}
function playTom(buffer, time) {
    const tomSource = audioContext.createBufferSource()
    tomSource.buffer = buffer
    tomSource.connect(gainNode)
    tomSource.start(time)
    return tomSource
}

async function loadHihat(url) {
    let response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return audioBuffer
}
async function setupHihat() {
    hihatBuffer = await loadHihat('sounds/hihat.wav')
}
function playHihat(buffer, time) {
    const hihatSource = audioContext.createBufferSource()
    hihatSource.buffer = buffer
    hihatSource.connect(gainNode)
    hihatSource.start(time)
    return hihatSource
}

async function loadSnare(url) {
    let response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return audioBuffer
}
async function setupSnare() {
    snareBuffer = await loadSnare('sounds/snare.wav')
}
function playSnare(buffer, time) {
    const snareSource = audioContext.createBufferSource()
    snareSource.buffer = buffer
    snareSource.connect(gainNode)
    snareSource.start(time)
    return snareSource
}

async function loadKick(url) {
    let response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return audioBuffer
}
async function setupKick() {
    kickBuffer = await loadKick('sounds/kick.wav')
}
function playKick(buffer, time) {
    const kickSource = audioContext.createBufferSource()
    kickSource.buffer = buffer
    kickSource.connect(gainNode)
    kickSource.start(time)
    return kickSource
}

async function loadClap(url) {
    let response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return audioBuffer
}
async function setupClap() {
    clapBuffer = await loadClap('sounds/clap.wav')
}
function playClap(buffer, time) {
    const clapSource = audioContext.createBufferSource()
    clapSource.buffer = buffer
    clapSource.connect(gainNode)
    clapSource.start(time)
    return clapSource
}

function nextLoop(next) {
    loop = 0
    if (!next) {
        // preset = 0
        timerWorker.postMessage("stop");
        isPlaying = !isPlaying;
        document.getElementById('beat').innerText = 1
        document.getElementById('play').innerText = 'Play'
    }
    else {
        // preset++
        tempo = next.tempo
        gainValues.sixtGain = next.sixtGain 
        gainValues.eighGain = next.eighGain
        gainValues.tripGain = next.tripGain
        gainValues.quarGain = next.quarGain
        gainValues.measGain = next.measGain
        gainValues.mastGain = next.mastGain
        maxLoops = next.maxLoops
    }
}

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
    return (gainValues.mastGain + 1) * value
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
    loopMode = maxLoops > 0
    // define time at which next note should play
    // secondsPerBeat converts tempo into seconds
    const secondsPerBeat = 60.0 / tempo;    // Notice this picks up the CURRENT 
                                          // tempo value to calculate beat length.
    noteTime += (1/12) * secondsPerBeat;
    currentSubdivision++
    if (currentSubdivision === beatsPerMeasure * 12 || currentSubdivision === 0) {
        console.log('measure')
        currentSubdivision = 0
        beat = 0                                    // reset at measure line for display
        console.log(loop, maxLoops)
        console.log(loopMode)
        if (loopMode) {
            if (loop === maxLoops) {    
                // nextLoop(nextLoop1)
                nextLoop(presets[loop])
                loop++
            }
            // if (preset === totalPresets) {
            // }
        }
    }
    if (currentSubdivision % 12 === 0) {
        beat++                                      // beats subdivided into 12 parts to cover 16th, triplets, 8ths
    }    
}

function scheduleNote( time ) {
    document.getElementById('beat').innerText = beat
    
    gainNode = audioContext.createGain()
    gainNode.connect(audioContext.destination)          
    
    if (currentSubdivision % (beatsPerMeasure * 12) === 0) {
        if (gainValues.measGain > -100) {
            playClap(clapBuffer, time)
            playKick(kickBuffer, time)
            gainNode.gain.value = volume(gainValues.measGain)    
        } else {
            playKick(kickBuffer, time)
            gainNode.gain.value = volume(gainValues.quarGain)
        }
    }
    else if (currentSubdivision % 12 === 0) {
        playKick(kickBuffer, time)
        gainNode.gain.value = volume(gainValues.quarGain)
    } 
    else if (currentSubdivision % 6 === 0) {
        playSnare(snareBuffer, time)
        gainNode.gain.value = volume(gainValues.eighGain)
    }
    else if (currentSubdivision % 4 === 0) {
        playTom(tomBuffer, time)
        gainNode.gain.value = volume(gainValues.tripGain)
    }
    else if (currentSubdivision % 3 === 0) {
        playHihat(hihatBuffer, time)
        gainNode.gain.value = volume(gainValues.sixtGain)
    } else {
        gainNode.gain.value = 0                             // mute all other 12let notes
    }
                                                            // use 8 for HNT and 2 for TS
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

    if (loopMode) {
        nextLoop(presets[loop])
        loop++
    }

    isPlaying = !isPlaying;

    if (isPlaying) { 
        currentSubdivision = 0
        noteTime = audioContext.currentTime + .05,
        timerWorker.postMessage("start");
        return "Stop";
    } else {
        loop = 0
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
    // Tone.Transport.start(0)
    // console.log(Tone.Transport)
    audioContext = new AudioContext()
    setupClap()
    setupKick()
    setupSnare()
    setupHihat()
    setupTom()

    timerWorker = new Worker("js/metronomeworker.js");
    timerWorker.onmessage = function(e) {
        if (e.data == "tick") {
            // console.log("tick!");
            scheduler();
        }
        else
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
}

window.addEventListener("load", init );

// 