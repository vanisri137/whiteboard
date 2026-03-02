export interface User {
  id: string;
  email: string;
  name: string;
}

export interface BoardElement {
  id: string;
  type: 'line' | 'rect' | 'circle' | 'text';
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  stroke: string;
  strokeWidth: number;
  fill?: string;
  rotation?: number;
}

export interface Board {
  id: string;
  name: string;
  owner: string;
  elements: BoardElement[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
