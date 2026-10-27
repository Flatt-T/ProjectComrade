/** Armour / robe colour for an infantry silhouette. Team colour is a pauldron, not the suit. */
export function infantryCostume(shape: string, team: string): { body: string; helm: string; skin: string } {
  switch (shape) {
    case 'storm': return { body: '#e6e8ec', helm: '#f2f4f6', skin: '#e2bf94' };
    case 'scout': return { body: '#d6d2c6', helm: '#ebe6d8', skin: '#e2bf94' };
    case 'death': return { body: '#1a1c1a', helm: '#101210', skin: '#1a1c1a' };
    case 'dark': return { body: '#3a4048', helm: '#2a3036', skin: '#3a4048' };
    case 'clone': return { body: '#eef0f4', helm: '#f4f6f8', skin: '#e2bf94' };
    case 'commando': return { body: '#5a5c48', helm: '#4a4c3c', skin: '#e2bf94' };
    case 'officer': return { body: '#6a6e74', helm: '#3a3c40', skin: '#e2bf94' };
    case 'rebel': return { body: '#6a7a48', helm: '#5a6a3c', skin: '#e2bf94' };
    case 'jedi': return { body: '#6b4a28', helm: '#c9a07c', skin: '#c9a07c' };
    case 'sith': return { body: '#1c1414', helm: '#1a1a1a', skin: '#d4b08c' };
    case 'wookiee': return { body: '#6b4423', helm: '#6b4423', skin: '#6b4423' };
    case 'droid': return { body: '#c4a56a', helm: '#c4a56a', skin: '#c4a56a' };
    case 'b2': return { body: '#6a7480', helm: '#5a6470', skin: '#6a7480' };
    case 'magna': return { body: '#5a3a78', helm: '#4a2a68', skin: '#5a3a78' };
    case 'droideka': return { body: '#6a7a88', helm: '#6a7a88', skin: '#6a7a88' };
    case 'probe': return { body: '#8a9298', helm: '#8a9298', skin: '#8a9298' };
    default: return { body: team, helm: team, skin: '#e2bf94' };
  }
}
