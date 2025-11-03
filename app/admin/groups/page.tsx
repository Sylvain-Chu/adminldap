"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Group = { cn: string; gidnumber: number; memberuid?: string[] }

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [cn, setCn] = useState("")
  const [gidnumber, setGidnumber] = useState("")
  const [loading, setLoading] = useState(false)

  async function load() {
    const res = await fetch("/api/groups")
    const data = await res.json()
    setGroups(data)
  }

  useEffect(() => { load() }, [])

  async function createGroup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cn, gidnumber: gidnumber ? Number(gidnumber) : undefined }),
      })
      if (res.ok) {
        setCn("")
        setGidnumber("")
        load()
      } else {
        alert(await res.text())
      }
    } finally {
      setLoading(false)
    }
  }

  async function removeGroup(name: string) {
    if (!confirm(`Supprimer le groupe "${name}" ?`)) return
    const res = await fetch(`/api/groups?cn=${encodeURIComponent(name)}`, { method: "DELETE" })
    if (res.ok) load()
    else alert(await res.text())
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Gestion des groupes</h1>
        <p className="text-muted-foreground mt-1">Créer et gérer les groupes LDAP</p>
      </div>

      <div className="mb-8">
        <a href="/admin" className="text-primary hover:underline">
          ← Retour aux demandes
        </a>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Créer un nouveau groupe</CardTitle>
          <CardDescription>Ajouter un groupe POSIX au système LDAP</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createGroup} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cn">Nom du groupe (cn)</Label>
                <Input
                  id="cn"
                  required
                  placeholder="famille"
                  value={cn}
                  onChange={(e) => setCn(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gidnumber">GID Number (optionnel)</Label>
                <Input
                  id="gidnumber"
                  type="number"
                  placeholder="Auto-généré si vide"
                  value={gidnumber}
                  onChange={(e) => setGidnumber(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Création..." : "Créer le groupe"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Groupes existants ({groups.length})</h2>
        {groups.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Aucun groupe créé</p>
            </CardContent>
          </Card>
        ) : (
          groups.map((g) => (
            <Card key={g.cn}>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{g.cn}</h3>
                      <Badge variant="outline">GID: {g.gidnumber}</Badge>
                    </div>
                    {g.memberuid && g.memberuid.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {g.memberuid.map((uid) => (
                          <Badge key={uid} variant="secondary" className="text-xs">
                            {uid}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Button variant="destructive" onClick={() => removeGroup(g.cn)}>
                      Supprimer
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
