export const LETTER = (row) => {
  let label = '';
  for (let value = row + 1; value; value = Math.floor((value - 1) / 26)) label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return label;
};
export const DEPT_CLASS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'];
