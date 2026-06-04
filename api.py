from fastapi import FastAPI
from dotenv import load_dotenv
import requests
import os

load_dotenv()

app = FastAPI(title="FC Porto Wiki 🔵⚪")

RAPID_KEY = os.getenv("RAPID_API_KEY")
HEADERS = {
    "x-apisports-key": RAPID_KEY
}
BASE_URL = "https://v3.football.api-sports.io/"


PORTO_ID = 212  

@app.get("/porto/matchs")
def get_matchs_porto():
    r = requests.get(f"{BASE_URL}/fixtures", headers=HEADERS, 
        params={"team": 212, "season": 2023, "status": "NS"})
    return r.json()

@app.get("/porto/resultats")
def get_resultats_porto():
    r = requests.get(f"{BASE_URL}/fixtures", headers=HEADERS,
        params={"team": 212, "season": 2023, "status": "FT"})

    data = r.json()
    resultats = []

    for match in data["response"]:
        resultats.append({
            "date": match["fixture"]["date"],
            "domicile": match["teams"]["home"]["name"],
            "exterieur": match["teams"]["away"]["name"],
            "score": f'{match["goals"]["home"]} - {match["goals"]["away"]}',
            "competition": match["league"]["name"],
            "stade": match["fixture"]["venue"]["name"]
        })

    return resultats

@app.get("/classement/liga-portugal")
def get_classement_liga():
    r = requests.get(f"{BASE_URL}/standings", headers=HEADERS, params={"league": 94, "season": 2023})
    return r.json()

@app.get("/classement/champions-league")
def get_classement_ucl():
    r = requests.get(f"{BASE_URL}/standings", headers=HEADERS, params={"league": 2, "season": 2023})
    return r.json()
