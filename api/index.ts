import express from 'express';
import app from '../backend/src/server';

const wrapper = express();
wrapper.use('/api', app);

export default wrapper;
