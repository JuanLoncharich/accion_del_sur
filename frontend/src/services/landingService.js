import axios from 'axios';

const publicApi = axios.create({
  baseURL: '/api/landing',
});

export const getLandingSummary = async () => {
  const { data } = await publicApi.get('/summary');
  return data;
};

export const getLandingCentersRanking = async () => {
  const { data } = await publicApi.get('/centers-ranking');
  return data;
};

export const getLandingRecentMovements = async () => {
  const { data } = await publicApi.get('/recent-movements');
  return data;
};
