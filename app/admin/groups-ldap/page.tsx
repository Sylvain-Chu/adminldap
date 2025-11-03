"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type Group = {
  dn: string
  cn: string
  gidNumber: number
  memberUid: string[]
}

export default function GroupsLdapPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/ldap/groups")
      if (!res.ok) throw new Error("Failed to fetch groups")
      const data = await res.json()
      setGroups(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Groupes LDAP</h1>
        <p className="text-muted-foreground mt-1">Liste des groupes existants dans le système</p>
      </div>

      <div className="mb-6 flex gap-4">
        <a href="/admin" className="text-primary hover:underline">
          ← Retour à l'admin
        </a>
        <a href="/admin/users-ldap" className="text-primary hover:underline">
          Voir les utilisateurs LDAP →
        </a>
        <a href="/admin/groups" className="text-primary hover:underline">
          Gérer les groupes (création) →
        </a>
      </div>

      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Chargement des groupes...</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-red-600">Erreur: {error}</p>
            <p className="text-center text-sm text-muted-foreground mt-2">
              Vérifiez que LDAP est configuré dans votre .env ou que des fichiers existent
            </p>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Aucun groupe trouvé</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Groupes ({groups.length})</h2>
            <Button onClick={load} variant="outline" size="sm">
              Actualiser
            </Button>
          </div>
          {groups.map((group) => (
            <Card key={group.cn}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{group.cn}</h3>
                    <Badge variant="outline">GID: {group.gidNumber}</Badge>
                  </div>
                  
                  {group.memberUid && group.memberUid.length > 0 ? (
                    <div>
                      <p className="text-sm font-medium mb-2">Membres ({group.memberUid.length}):</p>
                      <div className="flex flex-wrap gap-1">
                        {group.memberUid.map((uid) => (
                          <Badge key={uid} variant="secondary" className="text-xs">
                            {uid}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucun membre</p>
                  )}
                  
                  <p className="text-xs text-muted-foreground break-all">
                    <span className="font-medium">DN:</span> {group.dn}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
