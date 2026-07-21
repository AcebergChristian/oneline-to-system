from fastapi import FastAPI

app = FastAPI(title='project3')


@app.get('/api/health')
def health():
    return {'ok': True, 'project': 'project3', 'prompt': '继续    帮我做  你上面的，'}
