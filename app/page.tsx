import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Admin LDAP
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Système de gestion des demandes d'inscription et des groupes LDAP
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-12">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-2xl">Inscription</CardTitle>
              <CardDescription>
                Créer une nouvelle demande d'accès au système
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Remplissez le formulaire d'inscription. Votre demande sera examinée par un administrateur.
              </p>
              <a href="/inscription">
                <Button className="w-full">
                  Créer un compte →
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-2xl">Administration</CardTitle>
              <CardDescription>
                Gérer les demandes et les groupes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Accédez au panneau d'administration pour approuver les demandes et gérer les groupes LDAP.
              </p>
              <a href="/admin">
                <Button variant="outline" className="w-full">
                  Accéder à l'admin →
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>

        <div className="text-center text-sm text-muted-foreground mt-12">
          <p>💡 Astuce: Les administrateurs doivent s'authentifier pour accéder au panneau d'administration</p>
        </div>
      </div>
    </div>
  );
}
