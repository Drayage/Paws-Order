// Firebase 프로젝트 설정
// 주의: 이 프로젝트(Realtime Database)는 다른 게임들과 공유합니다.
// 그래서 net.js는 모든 데이터를 "pawsOrder/" 하위 경로에만 저장해서 다른 게임 데이터와 섞이지 않도록 합니다.
export const firebaseConfig = {
  apiKey: 'AIzaSyDnEYQRvb16iW0HZyq4bgrvtnPysDbeFBc',
  authDomain: 'frenzy-49857.firebaseapp.com',
  databaseURL: 'https://frenzy-49857-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'frenzy-49857',
  storageBucket: 'frenzy-49857.firebasestorage.app',
  messagingSenderId: '256453631137',
  appId: '1:256453631137:web:8cd0946dd629bd5c44a4e0',
};
