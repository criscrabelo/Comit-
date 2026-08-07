@echo off
title Patrono Alta Performance - Instalacao
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
