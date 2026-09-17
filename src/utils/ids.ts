let __idCounter = 0;
export function genId(){
  __idCounter = (__idCounter + 1) % 1000000;
  return `${Date.now().toString(36)}-${__idCounter.toString(36)}-${Math.random().toString(36).slice(2,8)}`;
}
