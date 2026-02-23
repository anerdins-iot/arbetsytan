# Ursprung: Kunskapsbas-Agent

## Problem
Den nuvarande AI-chattagenten har för dålig koll på vilka möjligheter och resurser som finns tillgängliga i systemet. Agenten är stateless och måste fråga användaren om grundläggande kontext som redan borde vara känd, t.ex. "Vilka projekt arbetar du med?" eller "Vilka filer finns tillgängliga?". Detta leder till ineffektiva konversationer och bristande proaktivitet.

## Krav
- Skapa en dynamisk intern databas som kontinuerligt uppdateras med viktig information om projektet
- Implementera en proaktiv bakgrundsagent som analyserar konversationer och systemhändelser
- Leverera strukturerad kontext till AI-chattagenten vid varje ny konversationsstart
- Komplettera det befintliga RAG-systemet med metadata och index över tillgängliga resurser
- Respektera multi-tenant-arkitekturen och säkerställa dataisolering

## Motivation
Genom att ge AI-agenten bättre initial kontext om vad som finns tillgängligt (projekt, roller, vanliga frågor, systemfunktioner) kan vi:
1. Minska antalet onödiga motfrågor
2. Öka agentens proaktivitet genom att föreslå relevanta alternativ
3. Förbättra användarupplevelsen genom snabbare och mer precisa svar
4. Reducera token-användning genom att undvika upprepade förklaringar av grundläggande kontext

## Scope Definition
Detta initiativ fokuserar på att skapa en **metadata-baserad kunskapsbas** som kompletterar det befintliga **innehållsbaserade RAG-systemet**. Vi bygger inte en komplett kunskapsgraf utan en praktisk, sökbar struktur av entiteter och deras egenskaper som kan injiceras som kontext.