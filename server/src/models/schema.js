import mongoose from 'mongoose';

export const { Schema, model } = mongoose;
export const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });
