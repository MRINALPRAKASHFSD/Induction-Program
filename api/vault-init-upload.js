"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
var app_1 = require("firebase-admin/app");
var jwt = require("jsonwebtoken");
var crypto = require("crypto");
var firebaseInitialized = false;
var firebaseInitError = null;
try {
    if (!(0, app_1.getApps)().length) {
        if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
            throw new Error("Missing Firebase Admin credentials in environment variables.");
        }
        (0, app_1.initializeApp)({
            credential: (0, app_1.cert)({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/^'|'$/g, '').replace(/\\n/g, '\n'),
            }),
        });
    }
    firebaseInitialized = true;
}
catch (error) {
    console.error('Firebase Admin Initialization Error:', error);
    firebaseInitError = error.message;
}
function handler(req, res) {
    return __awaiter(this, void 0, void 0, function () {
        var authHeader, token, decodedToken, uid, _a, filename, fileSize, fileHash, category, uploadType, imageLocation, bucketName, year, timestamp, safeCategory, safeFilename, filePath, geoFolder, contentType, expiresUnixSec, method, canonicalizedResource, stringToSign, sign, privateKey, signature, queryParams, url;
        return __generator(this, function (_b) {
            if (req.method !== 'POST') {
                return [2 /*return*/, res.status(405).json({ error: 'Method Not Allowed' })];
            }
            try {
                if (!firebaseInitialized) {
                    return [2 /*return*/, res.status(500).json({ error: "Firebase Admin not initialized. Reason: ".concat(firebaseInitError) })];
                }
                authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return [2 /*return*/, res.status(401).json({ error: 'Unauthorized: No token provided' })];
                }
                token = authHeader.split('Bearer ')[1];
                decodedToken = void 0;
                try {
                    decodedToken = jwt.decode(token);
                    if (!decodedToken)
                        throw new Error("Invalid token format");
                }
                catch (e) {
                    return [2 /*return*/, res.status(401).json({ error: 'Unauthorized: Invalid token format' })];
                }
                uid = decodedToken.user_id || decodedToken.uid;
                _a = req.body, filename = _a.filename, fileSize = _a.fileSize, fileHash = _a.fileHash, category = _a.category, uploadType = _a.uploadType, imageLocation = _a.imageLocation;
                if (!filename || !fileSize || !fileHash || !category || !uploadType) {
                    return [2 /*return*/, res.status(400).json({ error: 'Missing required fields' })];
                }
                bucketName = (process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || 'krmu-induction-app-d3591.firebasestorage.app').trim();
                year = new Date().getFullYear();
                timestamp = Date.now();
                safeCategory = category.toLowerCase().replace(/\s+/g, '-');
                safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
                filePath = void 0;
                if (uploadType === 'Image') {
                    geoFolder = imageLocation === 'Geo-tagged' ? 'geo-tagged' : 'non-geo-tagged';
                    filePath = "images/".concat(geoFolder, "/").concat(year, "/").concat(safeCategory, "/").concat(timestamp, "_").concat(safeFilename);
                }
                else {
                    filePath = "documents/".concat(year, "/").concat(safeCategory, "/").concat(timestamp, "_").concat(safeFilename);
                }
                contentType = req.body.contentType || 'application/octet-stream';
                expiresUnixSec = Math.floor(Date.now() / 1000) + 15 * 60;
                method = 'PUT';
                canonicalizedResource = "/".concat(bucketName, "/").concat(filePath.split('/').map(encodeURIComponent).join('/'));
                stringToSign = "".concat(method, "\n\n").concat(contentType, "\n").concat(expiresUnixSec, "\n").concat(canonicalizedResource);
                sign = crypto.createSign('RSA-SHA256');
                sign.update(stringToSign);
                privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/^'|'$/g, '').replace(/\\n/g, '\n');
                signature = sign.sign(privateKey, 'base64');
                queryParams = new URLSearchParams({
                    GoogleAccessId: process.env.FIREBASE_CLIENT_EMAIL.trim(),
                    Expires: expiresUnixSec.toString(),
                    Signature: signature,
                });
                url = "https://storage.googleapis.com".concat(canonicalizedResource, "?").concat(queryParams.toString());
                // We removed Firestore from the server side to completely avoid gRPC crashes.
                // The frontend already creates the document via the SDK.
                // We can also skip server-side duplicate check (frontend does it) or do it via REST if needed.
                return [2 /*return*/, res.status(200).json({
                        uploadUrl: url,
                        filePath: filePath
                    })];
            }
            catch (error) {
                console.error("Init Upload Error:", error);
                return [2 /*return*/, res.status(500).json({ error: "Internal Server Error: ".concat(error.message), stack: error.stack })];
            }
            return [2 /*return*/];
        });
    });
}
