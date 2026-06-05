import streamlit as st
import requests

API_URL = "http://127.0.0.1:8000"

st.set_page_config(page_title="FC Porto Wiki", page_icon=":soccer:", layout="wide")

st.title(":blue_circle::white_circle: FC Porto Wiki")

# Menu de navigation
page = st.sidebar.selectbox("Navigation", [
    "Résultats",
    "Classement Liga Portugal", 
    "Classement Champions League"
])

if page == "Résultats":
    st.header(":clipboard: Résultats 2023")
    data = requests.get(f"{API_URL}/porto/resultats").json()
    for match in data:
        st.write(f"**{match['domicile']}** {match['score']} **{match['exterieur']}**")
        st.caption(f":date: {match['date']} | :trophy: {match['competition']} | :stadium: {match['stade']}")
        st.divider()

elif page == "Classement Liga Portugal":
    st.header(":flag_pt: Classement Liga Portugal")
    data = requests.get(f"{API_URL}/classement/liga-portugal").json()
    for equipe in data["response"][0]["league"]["standings"][0]:
        st.write(f"**{equipe['rank']}.** {equipe['team']['name']} — {equipe['points']} pts")

elif page == "Classement Champions League":
    st.header(":star: Classement Champions League")
    data = requests.get(f"{API_URL}/classement/champions-league").json()
    for groupe in data["response"][0]["league"]["standings"]:
        for equipe in groupe:
            st.write(f"**{equipe['rank']}.** {equipe['team']['name']} — {equipe['points']} pts")