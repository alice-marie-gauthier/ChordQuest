# Generic "how to start this app" declaration understood by several
# hosting platforms (Railway, Heroku-style buildpacks) as an alternative
# to render.yaml. CHORDQUEST_HOST=0.0.0.0 is set inline here so the app is
# reachable from outside the container with no extra platform configuration
# beyond deploying the repo — see README.md's "Play from a phone or tablet"
# section.
web: CHORDQUEST_HOST=0.0.0.0 python app.py
