"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type User = {
  dn: string
  uid: string
  cn: string
  sn: string
  mail: string
  uidNumber: number
  gidNumber: number
  homeDirectory: string
  loginShell: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/ldap/users")
      if (!res.ok) throw new Error("Failed to fetch users")
      const data = await res.json()
      setUsers(data)
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
        <h1 className="text-3xl font-bold">Utilisateurs LDAP</h1>
        <p className="text-muted-foreground mt-1">Liste des utilisateurs existants dans le système</p>
      </div>

      <div className="mb-6 flex gap-4">
        <a href="/admin" className="text-primary hover:underline">
          ← Retour à l'admin
        </a>
        <a href="/admin/groups-ldap" className="text-primary hover:underline">
          Voir les groupes LDAP →
        </a>
      </div>

      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Chargement des utilisateurs...</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-red-600">Erreur: {error}</p>
            <p className="text-center text-sm text-muted-foreground mt-2">
              Vérifiez que LDAP est configuré dans votre .env ou que des fichiers LDIF existent
            </p>
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Aucun utilisateur trouvé</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Utilisateurs ({users.length})</h2>
            <Button onClick={load} variant="outline" size="sm">
              Actualiser
            </Button>
          </div>
          {users.map((user) => (
            <Card key={user.uid}>
              <CardContent className="pt-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{user.cn}</h3>
                      <Badge variant="outline">uid: {user.uid}</Badge>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="text-muted-foreground">
                        <span className="font-medium">Email:</span> {user.mail}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-medium">Nom:</span> {user.sn}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex gap-2">
                      <Badge variant="secondary">UID: {user.uidNumber}</Badge>
                      <Badge variant="secondary">GID: {user.gidNumber}</Badge>
                    </div>
                    <p className="text-muted-foreground">
                      <span className="font-medium">Home:</span> {user.homeDirectory}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium">Shell:</span> {user.loginShell}
                    </p>
                    <p className="text-xs text-muted-foreground break-all">
                      <span className="font-medium">DN:</span> {user.dn}
                    </p>
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
