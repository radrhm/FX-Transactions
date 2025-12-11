# Spot FX Transaction Manager - Deployment Guide

## Quick Deploy to Render (Recommended - Free Tier Available)

### Prerequisites
1. Create a free account at [Render.com](https://render.com)
2. Install Git on your machine if not already installed

### Deployment Steps

#### Option 1: Deploy via GitHub (Recommended)

1. **Install Git** (if not installed):
   - Download from: https://git-scm.com/downloads
   - Install with default settings

2. **Create GitHub Repository**:
   ```bash
   # In your project directory
   git init
   git add .
   git commit -m "Initial commit - FX Transaction Manager"
   ```
   
   - Go to https://github.com/new
   - Create a new repository (e.g., "fx-transaction-manager")
   - Follow GitHub's instructions to push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/fx-transaction-manager.git
   git branch -M main
   git push -u origin main
   ```

3. **Deploy on Render**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: fx-transaction-manager
     - **Environment**: Python 3
     - **Build Command**: (leave empty)
     - **Start Command**: `python server.py`
   - Click "Create Web Service"
   - Wait 2-3 minutes for deployment

4. **Access Your App**:
   - Render will provide a URL like: `https://fx-transaction-manager.onrender.com`
   - Share this link with anyone!

#### Option 2: Deploy via Render CLI

1. Install Render CLI:
   ```bash
   npm install -g @render/cli
   ```

2. Login and deploy:
   ```bash
   render login
   render deploy
   ```

---

## Alternative: Deploy to Railway

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway will auto-detect Python and deploy
6. Get your shareable link from the deployment dashboard

---

## Alternative: Deploy to PythonAnywhere (Free Tier)

1. Sign up at https://www.pythonanywhere.com
2. Go to "Web" tab
3. Click "Add a new web app"
4. Choose "Manual configuration" → Python 3.10
5. Upload your files via "Files" tab
6. Configure WSGI file to point to your server.py
7. Reload web app
8. Access via: `https://YOUR_USERNAME.pythonanywhere.com`

---

## Important Notes

- **Database**: The SQLite database will be created automatically on first run
- **Persistence**: On free tiers, the database may reset on app restarts. For production, consider upgrading to a paid tier with persistent storage
- **Port**: The app automatically uses the PORT environment variable provided by hosting platforms
- **Security**: This is a development server. For production use, consider adding authentication and using a production WSGI server like Gunicorn

---

## Files Included

- `server.py` - Main application server
- `index.html` - Frontend interface
- `script.js` - Frontend logic
- `styles.css` - Styling
- `requirements.txt` - Python dependencies (none required - uses stdlib)
- `.gitignore` - Git ignore rules

---

## Need Help?

If you encounter issues:
1. Check the deployment logs on your hosting platform
2. Ensure all files are uploaded correctly
3. Verify the start command is set to `python server.py`
4. Check that the PORT environment variable is being used
