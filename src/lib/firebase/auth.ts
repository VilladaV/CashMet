import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { auth } from './config'

export const login = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password)
export const signUp = (email: string, password: string) => createUserWithEmailAndPassword(auth, email, password)
export const logout = () => signOut(auth)
export const onAuthChange = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb)
