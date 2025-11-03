"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"

type Req = {
  id: string
  firstName: string
  lastName: string
  email: string
  status?: string
  createdAt?: string
}

export default function AdminPage() {
  const [requests, setRequests] = useState<Req[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/requests")
      const data = await res.json()
      setRequests(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function act(id: string, action: "accept" | "reject") {
    const res = await fetch(`/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    if (res.ok) load()
    else alert("Erreur: " + (await res.text()))
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" })
    router.push("/")
    router.refresh()
  }

  const pendingRequests = requests.filter(r => r.status === 'pending' || !r.status)
  const otherRequests = requests.filter(r => r.status && r.status !== 'pending')

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Administration</h1>
          <p className="text-muted-foreground mt-1">Gérer les demandes d'inscription et les groupes</p>
        </div>
        <Button variant="outline" onClick={logout}>
          Déconnexion
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Demandes en attente</CardTitle>
            <CardDescription>
              {pendingRequests.length} demande{pendingRequests.length !== 1 ? 's' : ''} à traiter
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <a href="/admin/groups" className="text-primary hover:underline">
                Gérer les groupes →
              </a>
            </CardTitle>
            <CardDescription>Créer, modifier et supprimer des groupes LDAP</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle>
              <a href="/admin/users-ldap" className="text-primary hover:underline">
                Utilisateurs LDAP →
              </a>
            </CardTitle>
            <CardDescription>Voir tous les utilisateurs existants dans LDAP</CardDescription>
          </CardHeader>
        </Card>
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle>
              <a href="/admin/groups-ldap" className="text-primary hover:underline">
                Groupes LDAP →
              </a>
            </CardTitle>
            <CardDescription>Voir tous les groupes existants dans LDAP</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Chargement...</p>
          </CardContent>
        </Card>
      ) : pendingRequests.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Aucune demande en attente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Demandes en attente</h2>
          {pendingRequests.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{r.firstName} {r.lastName}</h3>
                      <Badge variant="secondary">En attente</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.email}</p>
                    {r.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        Demandé le {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => act(r.id, 'accept')}>
                      Accepter
                    </Button>
                    <Button variant="destructive" onClick={() => act(r.id, 'reject')}>
                      Refuser
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {otherRequests.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-xl font-semibold">Demandes traitées</h2>
          {otherRequests.map((r) => (
            <Card key={r.id} className="opacity-60">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{r.firstName} {r.lastName}</h3>
                      <Badge variant={r.status === 'accepted' ? 'default' : 'destructive'}>
                        {r.status === 'accepted' ? 'Acceptée' : 'Refusée'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
