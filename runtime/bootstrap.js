/* Presentation-only sound adapter. Product preferences are never loaded or written. */
(function(){
 'use strict';
 var sound=false,guarded=false;
 var prefs={fanfareEnabled:true,audioMuted:false,fanfareAutoClose:false,sfxEnabled:false,voiceEnabled:false,sfxVolume:0};
 function guard(){
  if(window.QUIZ_FX_MANIFEST&&QUIZ_FX_MANIFEST.guaranteed)QUIZ_FX_MANIFEST.guaranteed.videoHasAudio=sound;
  if(!guarded&&window.QuizSfx){guarded=true;['play','prime'].forEach(function(k){var fn=QuizSfx[k];QuizSfx[k]=function(){return sound?fn.apply(QuizSfx,arguments):false;};});}
 }
 function setSound(on){
  sound=on===true;prefs.sfxEnabled=sound;prefs.voiceEnabled=sound;prefs.sfxVolume=sound?1:0;guard();
  if(!sound&&window.QuizSfx)QuizSfx.stopAll(true);
  document.querySelectorAll('.qz-fanfare video').forEach(function(v){v.muted=!sound;});
  document.dispatchEvent(new CustomEvent('ikebukuro:soundchange',{detail:{sound:sound}}));
  return sound;
 }
 function stopAll(){if(window.QuizSfx)QuizSfx.stopAll(true);if(window.QuizFanfare)QuizFanfare.dismiss();document.querySelectorAll('audio,video').forEach(function(a){a.pause();});document.dispatchEvent(new CustomEvent('ikebukuro:stop'));}
 window.QuizPrefs={get:function(){return Object.assign({},prefs);},update:function(p){Object.assign(prefs,p);prefs.audioMuted=false;return this.get();}};
 window.IkebukuroRuntime={getSound:function(){guard();return sound;},setSound:setSound,stopAll:stopAll};
 document.addEventListener('DOMContentLoaded',guard);window.addEventListener('pagehide',stopAll);document.addEventListener('visibilitychange',function(){if(document.hidden)stopAll();});
}());
